import { TeeableDeferred } from "../teeable_deferred.ts";
import {
  FingerprintTree,
  NodeType,
} from "../fingerprint_tree/fingerprint_tree.ts";
import { RangeMessengerConfig } from "./range_messenger_config.ts";

type DecodeStageResult<V, L> =
  | {
    type: "emptySet";
    canRespond: boolean;
  }
  | {
    type: "lowerBound";
    value: V;
  }
  | {
    lowerBound: V;
    type: "payload";
    payload: V;
    end?: { canRespond: boolean; upperBound: V };
  }
  | {
    lowerBound: V;
    type: "emptyPayload";
    upperBound: V;
  }
  | {
    lowerBound: V;
    type: "fingerprint";
    fingerprint: L;
    upperBound: V;
  }
  | { lowerBound: V; type: "done"; upperBound: V }
  | { type: "terminal" };

type CollateStageResult<V, L> =
  | Exclude<DecodeStageResult<V, L>, {
    lowerBound: V;
    type: "payload";
    payload: V;
    end?: { canRespond: boolean; upperBound: V };
  }>
  | {
    lowerBound: V;
    type: "payload";
    payload: V[];
    end: { canRespond: boolean; upperBound: V };
  };

type ProcessStageResult<V, L> =
  | {
    type: "emptySet";
    canRespond: false;
  }
  | {
    type: "lowerBound";
    value: V;
  }
  | {
    type: "payload";
    payload: V;
    end?: { canRespond: boolean; upperBound: V };
  }
  | {
    type: "emptyPayload";
    upperBound: V;
  }
  | {
    type: "fingerprint";
    fingerprint: L;
    upperBound: V;
  }
  | { type: "done"; upperBound: V }
  | { type: "terminal" };

export type RangeMessengerOpts<EncodedMessageType, ValueType, LiftedType> = {
  tree: FingerprintTree<ValueType, LiftedType>;
  fingerprintEquals: (a: LiftedType, b: LiftedType) => boolean;
  encoding: RangeMessengerConfig<EncodedMessageType, ValueType, LiftedType>;
  /** If the size of a newly partitioned range is equal to or less than this number, that range's elements will be sent to the other peer. _Must_ be higher than 1.*/
  payloadThreshold: number;
  /** How many parts to subdivide ranges into. */
  rangeDivision: number;
};

/** Produces and responds to messages, enabling efficient reconciliation of two sets. */
export class RangeMessenger<EncodedMessageType, ValueType, LiftedType> {
  private tree: FingerprintTree<ValueType, LiftedType>;
  private encoding: RangeMessengerConfig<
    EncodedMessageType,
    ValueType,
    LiftedType
  >;
  private isDoneTee = new TeeableDeferred();
  private insertionCallbacks = new Set<(v: ValueType) => void>();
  private fingerprintEquals: (a: LiftedType, b: LiftedType) => boolean;
  private payloadThreshold: number;
  private rangeDivision: number;

  constructor(
    opts: RangeMessengerOpts<EncodedMessageType, ValueType, LiftedType>,
  ) {
    this.tree = opts.tree;
    this.fingerprintEquals = opts.fingerprintEquals;
    this.encoding = opts.encoding;
    this.payloadThreshold = opts.payloadThreshold;
    this.rangeDivision = opts.rangeDivision;
  }

  /** The lower bound of the next message, derived from the upper bound of the previous call to respond.*/
  private lowerBoundFromPrev: ValueType = null as unknown as ValueType;

  /** Decodes an incoming message, and remembers its upper bound to use as a lower bound for the next message. */
  private decode(
    message: EncodedMessageType,
  ): DecodeStageResult<ValueType, LiftedType> {
    const lowerBound = this.lowerBoundFromPrev;

    try {
      const canRespond = this.encoding.decode.emptySet(message);

      return ({
        type: "emptySet",
        canRespond,
      });
    } catch {
      // Not an empty set message.
    }

    try {
      const lowerBoundMsg = this.encoding.decode.lowerBound(message);

      this.lowerBoundFromPrev = lowerBoundMsg;

      // Stop processing of this message here, we no longer need it.
      return ({
        "type": "lowerBound",
        value: lowerBoundMsg,
      });
    } catch {
      // Not a lower bound message.
    }

    try {
      this.encoding.decode.terminal(message);
      return ({ "type": "terminal" });
    } catch {
      // Not a terminal message
    }

    try {
      const rangeDoneUpperBound = this.encoding.decode.done(message);

      this.lowerBoundFromPrev = rangeDoneUpperBound;

      return ({
        lowerBound: lowerBound,
        type: "done",
        upperBound: rangeDoneUpperBound,
      });
    } catch {
      // Not a done message
    }

    try {
      const fingerprintMsg = this.encoding.decode.fingerprint(message);

      this.lowerBoundFromPrev = fingerprintMsg.upperBound;
      return ({
        "type": "fingerprint",
        lowerBound: lowerBound,
        fingerprint: fingerprintMsg.fingerprint,
        upperBound: fingerprintMsg.upperBound,
      });
    } catch {
      // Not a fingerprint message
    }

    try {
      const payloadMsg = this.encoding.decode.payload(message);

      if (payloadMsg.end) {
        this.lowerBoundFromPrev = payloadMsg.end.upperBound;
      }

      return ({
        "type": "payload",
        lowerBound: lowerBound,
        "payload": payloadMsg.value,
        ...(payloadMsg.end ? { end: payloadMsg.end } : {}),
      });
    } catch {
      // Not a payload message.
    }

    try {
      const emptyPayloadMsg = this.encoding.decode.emptyPayload(message);

      this.lowerBoundFromPrev = emptyPayloadMsg;

      return ({
        lowerBound: lowerBound,
        "type": "emptyPayload",
        upperBound: emptyPayloadMsg,
      });
    } catch {
      // Not an empty payload message
    }

    return null as never;
  }

  /** A collated payload object created from many previous payload messages.  */
  private collatedPayload: {
    lowerBound: ValueType;
    type: "payload";
    payload: ValueType[];
    end: { canRespond: boolean; upperBound: ValueType };
  } | null = null;

  /* Combines successive payload messages into a single message with many payloads. */
  private collatePayloads = (
    decoded: DecodeStageResult<ValueType, LiftedType>,
  ): CollateStageResult<ValueType, LiftedType> | undefined => {
    {
      switch (decoded.type) {
        case "payload": {
          let nextPayload = this.collatedPayload;

          if (nextPayload === null) {
            nextPayload = {
              type: "payload",
              lowerBound: decoded.lowerBound,
              payload: [],
              end: { canRespond: false, upperBound: decoded.payload },
            };
          }

          nextPayload.payload.push(decoded.payload);
          this.collatedPayload = nextPayload;

          if (decoded.end) {
            nextPayload.end = decoded.end;
            this.collatedPayload = null;
            return (nextPayload);
          }

          break;
        }
        default: {
          if (this.collatedPayload) {
            // This shouldn't happen.
            this.collatedPayload = null;
          }

          return (decoded);
        }
      }
    }
  };

  /** A tree returned by the previous call of tree.getFingeprint, to be used by the next call to `.respond`. */
  private reusableTree: NodeType<ValueType, LiftedType> | undefined = undefined;

  /** A tiny convenience for casting the reusable tree to the right type. */
  private setReusableTree(tree: NodeType<ValueType, LiftedType> | null) {
    this.reusableTree = tree || undefined;
  }

  /** Formulate the reply to a given message, as well as carry out any side effects such as inserting items into the tree. */
  private process(
    result: CollateStageResult<ValueType, LiftedType>,
  ): ProcessStageResult<ValueType, LiftedType>[] {
    const treeToUse = this.reusableTree;

    switch (result.type) {
      case "lowerBound":
      case "terminal":
      case "done":
        this.setReusableTree(null);
        return [result];

      case "emptySet": {
        if (result.canRespond === false) {
          this.isDoneTee.resolve();
        }

        if (this.tree.size === 0) {
          return [{ type: "emptySet", canRespond: false }];
        }

        // Return everything we've got.
        const lowestValue = this.tree.getLowestValue();

        const messages: ProcessStageResult<ValueType, LiftedType>[] = [{
          type: "lowerBound",
          value: lowestValue,
        }];

        const allItems = Array.from(this.tree.lnrValues());

        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];

          if (i === allItems.length - 1) {
            messages.push({
              type: "payload",
              payload: item,
              end: {
                upperBound: lowestValue,
                canRespond: false,
              },
            });
          } else {
            messages.push({ type: "payload", payload: item });
          }
        }

        messages.push({ type: "terminal" });

        return messages;
      }

      case "fingerprint": {
        // If the fingerprint is not neutral, compare it with our own fingeprint of this range.
        const { fingerprint, size, items, nextTree } = this.tree.getFingerprint(
          result.lowerBound,
          result.upperBound,
          treeToUse,
        );

        this.setReusableTree(nextTree);

        // If the fingeprints match, we've reconciled this range. Hooray!
        if (this.fingerprintEquals(fingerprint, result.fingerprint)) {
          return [{
            "type": "done",
            upperBound: result.upperBound,
          }];
        }

        // If it doesn't, check how many items are in the non-matching range...
        if (size <= this.payloadThreshold) {
          // If we have zero items in this range,
          //  Send an empty payload
          if (size === 0) {
            return [{
              type: "emptyPayload",
              upperBound: result.upperBound,
            }];
          }

          // Otherwise, send a payload for each item here.
          const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

          for (let i = 0; i < size; i++) {
            acc.push({
              type: "payload",
              payload: items[i],
              ...(i === items.length - 1
                ? {
                  end: { upperBound: result.upperBound, canRespond: true },
                }
                : {}),
            });
          }

          return acc;
        } else {
          const chunkSize = Math.ceil(size / this.rangeDivision);
          const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

          if (chunkSize <= this.payloadThreshold) {
            for (let i = 0; i < items.length; i++) {
              acc.push({
                type: "payload",
                payload: items[i],
                ...(i === items.length - 1
                  ? {
                    end: {
                      upperBound: result.upperBound,
                      canRespond: true,
                    },
                  }
                  : {}),
              });
            }

            return acc;
          }

          let reusableTreeForChunks = undefined;
          const itemsToUse = items;
          let changedItems = false;

          if (result.lowerBound >= result.upperBound) {
            const indexFirstItemGteLowerBound = items.findIndex((item) => {
              return item >= result.lowerBound;
            });

            if (indexFirstItemGteLowerBound > 0) {
              const newEnd = itemsToUse.splice(0, indexFirstItemGteLowerBound);
              itemsToUse.push(...newEnd);
              changedItems = true;
            }
          }

          for (let i = 0; i < size; i += chunkSize) {
            const rangeBeginning = itemsToUse[i];
            const rangeEnd = itemsToUse[i + chunkSize] || result.upperBound;

            const { fingerprint: chunkFingerprint, nextTree } = this.tree
              .getFingerprint(
                rangeBeginning,
                rangeEnd,
                reusableTreeForChunks,
              );

            reusableTreeForChunks = changedItems
              ? undefined
              : nextTree || undefined;

            acc.push({
              type: "fingerprint",
              fingerprint: chunkFingerprint,
              upperBound: rangeEnd,
            });
          }

          return acc;
        }
      }

      case "payload": {
        // add all items in the payload to the tree
        for (const payloadItem of result.payload) {
          this.tree.insert(payloadItem);

          for (const callback of this.insertionCallbacks) {
            callback(payloadItem);
          }
        }

        // If we can respond, send back payloads for everything in this range we have.
        if (result.end.canRespond) {
          const { items, size, nextTree } = this.tree.getFingerprint(
            result.lowerBound,
            result.end.upperBound,
            treeToUse,
          );

          this.setReusableTree(nextTree);

          if (size === 0) {
            return [{
              type: "emptyPayload",
              upperBound: result.end.upperBound,
            }];
          }

          const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

          for (let i = 0; i < size; i++) {
            acc.push({
              type: "payload",
              payload: items[i],
              ...(i === items.length - 1
                ? {
                  end: {
                    upperBound: result.end.upperBound,
                    canRespond: false,
                  },
                }
                : {}),
            });
          }

          return acc;
        } else {
          // Or are we done here...
          this.setReusableTree(null);

          return [{
            type: "done",
            upperBound: result.end.upperBound,
          }];
        }
      }

      case "emptyPayload": {
        this.setReusableTree(null);

        const { items, size, nextTree } = this.tree.getFingerprint(
          result.lowerBound,
          result.upperBound,
          //treeToUse,
        );

        this.setReusableTree(nextTree);

        if (size === 0) {
          this.setReusableTree(null);
          return [];
        }

        const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

        for (let i = 0; i < size; i++) {
          acc.push({
            type: "payload",
            payload: items[i],
            ...(i === items.length - 1
              ? {
                end: {
                  upperBound: result.upperBound,
                  canRespond: false,
                },
              }
              : {}),
          });
        }

        return acc;
      }
    }
  }

  /** The last upper bound of a series of adjacent 'done' messages, used to consolidate multiple done messages into a single one. */
  private lastAdjacentDoneUpperBound: ValueType | null = null;

  /** Consolidate many adjacent done messages into a single done message, with the upper bound of the last one. */
  private consolidateAdjacentDones(
    result: ProcessStageResult<ValueType, LiftedType>,
  ): ProcessStageResult<ValueType, LiftedType>[] | undefined {
    switch (result.type) {
      case "done": {
        this.lastAdjacentDoneUpperBound = result.upperBound;

        break;
      }

      default: {
        const lastDoneUpperBound = this.lastAdjacentDoneUpperBound;

        if (lastDoneUpperBound) {
          this.lastAdjacentDoneUpperBound = null;
          return [{
            "type": "done",
            upperBound: lastDoneUpperBound,
          }, result];
        }

        return [result];
      }
    }
  }

  /** Indicates if we are done judging from received messages from the current round of messages. */
  private isDoneSoFar = true;

  /** Determine if reconciliation has been achieved by looking at messages. */
  private checkIsDone(
    message: ProcessStageResult<ValueType, LiftedType>,
  ): void {
    switch (message.type) {
      case "emptySet": {
        if (message.canRespond) {
          this.isDoneSoFar = false;
        }
        break;
      }
      case "lowerBound":
        break;
      case "fingerprint":
        this.isDoneSoFar = false;
        break;
      case "emptyPayload":
        this.isDoneSoFar = false;
        break;
      case "payload":
        if (message.end?.canRespond === true) {
          this.isDoneSoFar = false;
        }
        break;
      case "terminal":
        if (this.isDoneSoFar) {
          this.isDoneTee.resolve();
        } else {
          this.isDoneSoFar = true;
        }
    }
  }

  encode(
    message: ProcessStageResult<ValueType, LiftedType>,
  ): EncodedMessageType {
    let encoded: EncodedMessageType;

    switch (message.type) {
      case "emptySet": {
        encoded = this.encoding.encode.emptySet(message.canRespond);
        break;
      }
      case "lowerBound": {
        encoded = this.encoding.encode.lowerBound(message.value);

        break;
      }
      case "done": {
        encoded = this.encoding.encode.done(message.upperBound);
        break;
      }
      case "fingerprint": {
        encoded = this.encoding.encode.fingerprint(
          message.fingerprint,
          message.upperBound,
        );
        break;
      }
      case "payload": {
        encoded = this.encoding.encode.payload(message.payload, message.end);
        break;
      }
      case "emptyPayload": {
        encoded = this.encoding.encode.emptyPayload(message.upperBound);
        break;
      }
      case "terminal": {
        encoded = this.encoding.encode.terminal();
        break;
      }
    }

    return encoded;
  }

  /** Formulates and returns the appropriate response given a message from another peer. May insert values into the RangeMessenger's tree.
   *
   * This method must be called with the messages from another peer, in the order they came.
   */
  respond(message: EncodedMessageType): Array<EncodedMessageType> {
    if (this.isDone().state === "fulfilled") {
      return [];
    }

    // In the second stage of the pipeline we need to consolidate all payload messages into a single message with all items included.

    // In the third stage of the pipeline we formulate our response to these messages, as well as perform tree insertions.

    // In the fifth stage we check if all messages are pretty much done.

    // In the sixth stage af the pipeline we encode the messages.

    // First decode the incoming messages.
    const decoded = this.decode(message);

    // Then consolidate successive payload messages into a single message with many items.
    const collated = this.collatePayloads(decoded);

    if (collated === undefined) {
      return [];
    }

    // Then formulate responses from the incoming messages.
    const processed = this.process(collated || []);

    const consolidated: ProcessStageResult<ValueType, LiftedType>[] = [];

    // Then consolidate adjacent done messages into a single done message.
    for (const item of processed) {
      const res = this.consolidateAdjacentDones(item);

      if (res) {
        consolidated.push(...res);
      }
    }

    // Determine if reconciliation is finished by checking the messages.
    for (const item of consolidated) {
      this.checkIsDone(item);
    }

    const encoded: EncodedMessageType[] = [];

    // Encode the messages.
    for (const item of consolidated) {
      encoded.push(this.encode(item));
    }

    return encoded;
  }

  isDone() {
    return this.isDoneTee.tee();
  }

  /** Returns the opening messages for initiating an exchange between two peers. */
  initialMessages(
    partitionItems?: (items: ValueType[]) => ValueType[][],
  ): Iterable<EncodedMessageType> {
    const { tree, encoding, payloadThreshold, rangeDivision } = this;

    function* initiatingElements(): Iterable<EncodedMessageType> {
      if (tree.size === 0) {
        yield encoding.encode.emptySet(true);

        return;
      }

      // TODO: split fingerprint in two (make this configurable with b)
      const lowestValue = tree.getLowestValue();

      const lowerEncoded = encoding.encode.lowerBound(lowestValue);

      yield lowerEncoded;

      const { items } = tree.getFingerprint(
        lowestValue,
        lowestValue,
      );

      const partition = partitionItems || ((items: ValueType[]) => {
        const chunkSize = Math.ceil(
          items.length / rangeDivision,
        );

        const acc: ValueType[][] = [];

        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          acc.push(chunk);
        }

        return acc;
      });

      const chunks = partition(items);

      let reusableTreeForChunks = undefined;

      for (let ci = 0; ci < chunks.length; ci++) {
        const rangeEnd = chunks[ci + 1] ? chunks[ci + 1][0] : lowestValue;

        const chunk = chunks[ci];

        if (chunk.length <= payloadThreshold) {
          for (let i = 0; i < chunk.length; i++) {
            yield encoding.encode.payload(
              chunk[i],
              i === chunk.length - 1
                ? {
                  upperBound: rangeEnd,
                  canRespond: true,
                }
                : undefined,
            );
          }
        } else {
          const rangeBeginning = chunk[0];

          const { fingerprint: chunkFingerprint, nextTree } = tree
            .getFingerprint(
              rangeBeginning,
              rangeEnd,
              reusableTreeForChunks,
            );

          reusableTreeForChunks = nextTree || undefined;

          yield encoding.encode.fingerprint(chunkFingerprint, rangeEnd);
        }
      }

      const terminalEncoded = encoding.encode.terminal();
      yield terminalEncoded;
    }

    return initiatingElements();
  }

  onInsertion(
    callback: (value: ValueType) => void,
  ): () => void {
    this.insertionCallbacks.add(callback);

    return () => {
      this.insertionCallbacks.delete(callback);
    };
  }
}
