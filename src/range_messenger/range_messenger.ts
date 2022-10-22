import { TeeableDeferred } from "../teeable_deferred.ts";
import {
  FingerprintTree,
  NodeType,
} from "../fingerprint_tree/fingerprint_tree.ts";
import { RangeMessengerConfig } from "./range_messenger_config.ts";

type DecodeStageResult<V, L> =
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

/** Produces and responds to messages, enabling efficient reconciliation of two sets. */
export class RangeMessenger<EncodedMessageType, ValueType, LiftedType> {
  private tree: FingerprintTree<ValueType, LiftedType>;
  private config: RangeMessengerConfig<
    EncodedMessageType,
    ValueType,
    LiftedType
  >;
  private isDoneTee = new TeeableDeferred();

  constructor(
    tree: FingerprintTree<ValueType, LiftedType>,
    config: RangeMessengerConfig<EncodedMessageType, ValueType, LiftedType>,
  ) {
    this.tree = tree;
    this.config = config;
  }

  /** The lower bound of the next message, derived from the upper bound of the previous call to respond.*/
  private lowerBoundFromPrev: ValueType = null as ValueType;

  /** Decodes an incoming message, and remembers its upper bound to use as a lower bound for the next message. */
  private decode(
    message: EncodedMessageType,
  ): DecodeStageResult<ValueType, LiftedType> {
    const lowerBoundMsg = this.config.decode.lowerBound(message);

    const lowerBound = this.lowerBoundFromPrev;

    if (lowerBoundMsg) {
      this.lowerBoundFromPrev = lowerBoundMsg;

      // Stop processing of this message here, we no longer need it.
      return ({
        "type": "lowerBound",
        value: lowerBoundMsg,
      });
    }

    const terminalMsg = this.config.decode.terminal(message);

    if (terminalMsg) {
      return ({ "type": "terminal" });
    }

    const rangeDoneUpperBound = this.config.decode.done(message);

    if (rangeDoneUpperBound !== false) {
      this.lowerBoundFromPrev = rangeDoneUpperBound;

      return ({
        lowerBound: lowerBound,
        type: "done",
        upperBound: rangeDoneUpperBound,
      });
    }

    const fingerprintMsg = this.config.decode.fingerprint(message);

    if (fingerprintMsg) {
      this.lowerBoundFromPrev = fingerprintMsg.upperBound;
      return ({
        "type": "fingerprint",
        lowerBound: lowerBound,
        fingerprint: fingerprintMsg.fingerprint,
        upperBound: fingerprintMsg.upperBound,
      });
    }

    const payloadMsg = this.config.decode.payload(message);

    if (payloadMsg) {
      if (payloadMsg.end) {
        this.lowerBoundFromPrev = payloadMsg.end.upperBound;
      }

      return ({
        "type": "payload",
        lowerBound: lowerBound,
        "payload": payloadMsg.value,
        ...(payloadMsg.end ? { end: payloadMsg.end } : {}),
      });
    }

    const emptyPayloadMsg = this.config.decode.emptyPayload(message);

    if (emptyPayloadMsg) {
      this.lowerBoundFromPrev = emptyPayloadMsg;

      return ({
        lowerBound: lowerBound,
        "type": "emptyPayload",
        upperBound: emptyPayloadMsg,
      });
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

      case "fingerprint": {
        // If the fingerprint is not neutral, compare it with our own fingeprint of this range.
        const { fingerprint, size, items, nextTree } = this.tree.getFingerprint(
          result.lowerBound,
          result.upperBound,
          treeToUse,
        );

        this.setReusableTree(nextTree);

        // If the fingeprints match, we've reconciled this range. Hooray!
        if (fingerprint === result.fingerprint) {
          return [{
            "type": "done",
            upperBound: result.upperBound,
          }];
        }

        // If it doesn't, check how many items are in the non-matching range...
        // TODO: make k configurable.
        const k = 1;

        if (size <= k) {
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
          // If we have more than k items, we want to divide the range into b parts.
          // TODO: make b configurable

          let itemsToUse = items;
          let changedItems = false;

          if (result.lowerBound >= result.upperBound) {
            // Search for the lower bound in items.
            const indexOfLowerBound = items.indexOf(result.lowerBound);

            if (indexOfLowerBound > 0) {
              const newStart = items.slice(indexOfLowerBound);
              const newEnd = items.slice(0, indexOfLowerBound);

              changedItems = true;

              itemsToUse = [...newStart, ...newEnd];
            }
          }

          const b = 32;

          const chunkSize = Math.ceil(size / b);

          if (chunkSize <= k) {
            const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

            for (let i = 0; i < size; i++) {
              acc.push({
                type: "payload",

                payload: itemsToUse[i],
                ...(i === size - 1
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

          const acc: ProcessStageResult<ValueType, LiftedType>[] = [];

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
      case "lowerBound":
        this.isDoneSoFar = true;
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
      case "lowerBound": {
        encoded = this.config.encode.lowerBound(message.value);

        break;
      }
      case "done": {
        encoded = this.config.encode.done(message.upperBound);
        break;
      }
      case "fingerprint": {
        encoded = this.config.encode.fingerprint(
          message.fingerprint,
          message.upperBound,
        );
        break;
      }
      case "payload": {
        encoded = this.config.encode.payload(message.payload, message.end);
        break;
      }
      case "emptyPayload": {
        encoded = this.config.encode.emptyPayload(message.upperBound);
        break;
      }
      case "terminal": {
        encoded = this.config.encode.terminal();
        break;
      }
    }

    return (encoded);
  }

  /** Formulates and returns the appropriate response given a message from another peer. May insert values into the RangeMessenger's tree.
   *
   * This method must be called with the messages from another peer, in the order they came.
   */
  respond(message: EncodedMessageType): Array<EncodedMessageType> {
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
  initialMessages(): Iterable<EncodedMessageType> {
    const { tree, config } = this;

    function* initiatingElements(): Iterable<EncodedMessageType> {
      if (tree.size === 0) {
        /*
              TODO: Do the right thing when the tree is empty.

              const lowerEncoded = config.encode.lowerBound(null);
              const fingerprintEncoded = config.encode.emptyPayload(
                tree.monoid.neutral[0],
              );
              const terminalEncoded = config.encode.terminal();


              controller.enqueue(lowerEncoded);
              controller.enqueue(fingerprintEncoded);
              controller.enqueue(terminalEncoded);

              return;
              */
      }

      // TODO: split fingerprint in two (make this configurable with b)
      const lowestValue = tree.getLowestValue();

      const lowerEncoded = config.encode.lowerBound(lowestValue);

      yield lowerEncoded;

      const { items, size } = tree.getFingerprint(
        lowestValue,
        lowestValue,
      );

      const k = 1;

      if (size <= k) {
        // If we have zero items in this range,  send all items we have from here.
        if (size === 0) {
          const emptyEncoded = config.encode.emptyPayload(lowestValue);
          yield emptyEncoded;
        }

        // Otherwise, send a payload for each item here.
        for (let i = 0; i < items.length; i++) {
          const payloadEncoded = config.encode.payload(
            items[i],
            i === items.length - 1
              ? {
                upperBound: lowestValue,
                canRespond: true,
              }
              : undefined,
          );

          yield payloadEncoded;
        }
      } else {
        const b = 2;

        const chunkSize = Math.ceil(size / b);

        // if it's > k then divide ranges (could be divided into 2 or more depending on number of items, define this with b.)
        for (let i = 0; i < size; i += chunkSize) {
          // calculate fingerprint with
          const rangeBeginning = items[i];

          const rangeEnd = items[i + chunkSize] || lowestValue;

          const { fingerprint: chunkFingerprint } = tree.getFingerprint(
            rangeBeginning,
            rangeEnd,
          );

          const fingerprintEncoded = config.encode.fingerprint(
            chunkFingerprint,
            rangeEnd,
          );

          yield fingerprintEncoded;
        }
      }

      const terminalEncoded = config.encode.terminal();
      yield terminalEncoded;
    }

    return initiatingElements();
  }
}
