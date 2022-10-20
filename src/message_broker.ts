import { DeferredTee } from "./deferred_tee.ts";
import { FingerprintTree, NodeType } from "./fingerprint_tree.ts";
import { MessageBrokerConfig } from "./message_broker_config.ts";

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

export class MessageBroker<E, V, L> {
  // new stuff.

  private tree: FingerprintTree<V, L>;
  private config: MessageBrokerConfig<E, V, L>;
  private isDoneTee = new DeferredTee();

  constructor(
    tree: FingerprintTree<V, L>,
    config: MessageBrokerConfig<E, V, L>,
  ) {
    this.tree = tree;
    this.config = config;
  }

  lowerBoundFromPrev: V = null as V;
  collatedPayload: {
    lowerBound: V;
    type: "payload";
    payload: V[];
    end: { canRespond: boolean; upperBound: V };
  } | null = null;
  reusableTree: NodeType<V, L> | undefined = undefined;
  lastDoneUpperBound: V | null = null;
  isDoneSoFar = true;
  isReallyDone = false;

  respond(message: E): Iterable<E> {
    const { tree, config } = this;

    //  In the first stage, we decode the incoming messages and give each a lower bound using the upper bound of the message which came before it.

    const setLowerBound = (bound: V) => {
      this.lowerBoundFromPrev = bound;
    };

    const getLowerBound = () => {
      return this.lowerBoundFromPrev;
    };

    function* decode(message: E): Iterable<DecodeStageResult<V, L>> {
      const lowerBoundMsg = config.decode.lowerBound(message);

      const lowerBound = getLowerBound();

      if (lowerBoundMsg) {
        setLowerBound(lowerBoundMsg);

        // Stop processing of this message here, we no longer need it.
        yield ({
          "type": "lowerBound",
          value: lowerBoundMsg,
        });

        return;
      }

      const terminalMsg = config.decode.terminal(message);

      if (terminalMsg) {
        yield ({ "type": "terminal" });
        return;
      }

      const rangeDoneUpperBound = config.decode.done(message);

      if (rangeDoneUpperBound !== false) {
        yield ({
          lowerBound: lowerBound,
          type: "done",
          upperBound: rangeDoneUpperBound,
        });

        setLowerBound(rangeDoneUpperBound);
        return;
      }

      const fingerprintMsg = config.decode.fingerprint(message);

      if (fingerprintMsg) {
        yield ({
          "type": "fingerprint",
          lowerBound: lowerBound,
          fingerprint: fingerprintMsg.fingerprint,
          upperBound: fingerprintMsg.upperBound,
        });

        setLowerBound(fingerprintMsg.upperBound);
        return;
      }

      const payloadMsg = config.decode.payload(message);

      if (payloadMsg) {
        yield ({
          "type": "payload",
          lowerBound: lowerBound,
          "payload": payloadMsg.value,
          ...(payloadMsg.end ? { end: payloadMsg.end } : {}),
        });

        if (payloadMsg.end) {
          setLowerBound(payloadMsg.end.upperBound);
        }
        return;
      }

      const emptyPayloadMsg = config.decode.emptyPayload(message);

      if (emptyPayloadMsg) {
        yield ({
          lowerBound: lowerBound,
          "type": "emptyPayload",
          upperBound: emptyPayloadMsg,
        });

        setLowerBound(emptyPayloadMsg);
        return;
      }
    }

    // In the second stage of the pipeline we need to consolidate all payload messages into a single message with all items included.

    const setCollatedPayload = (
      payload: {
        lowerBound: V;
        type: "payload";
        payload: V[];
        end: { canRespond: boolean; upperBound: V };
      } | null,
    ) => {
      this.collatedPayload = payload;
    };

    const getCollatedPayload = () => this.collatedPayload;

    function* collatePayloadsStage(
      decoded: DecodeStageResult<V, L>,
    ): Iterable<CollateStageResult<V, L>> {
      {
        switch (decoded.type) {
          case "payload": {
            let nextPayload = getCollatedPayload();

            if (nextPayload === null) {
              nextPayload = {
                type: "payload",
                lowerBound: decoded.lowerBound,
                payload: [],
                end: { canRespond: false, upperBound: decoded.payload },
              };
            }

            nextPayload.payload.push(decoded.payload);
            setCollatedPayload(nextPayload);

            if (decoded.end) {
              nextPayload.end = decoded.end;
              yield (nextPayload);
              setCollatedPayload(null);
            }

            break;
          }
          default: {
            if (getCollatedPayload()) {
              // This shouldn't happen.
              setCollatedPayload(null);
            }

            yield (decoded);
          }
        }
      }
    }

    // In the third stage of the pipeline we formulate our response to these messages, as well as perform tree insertions.
    const getReusableTree = () => this.reusableTree;
    const setReusableTree = (tree: NodeType<V, L> | null) => {
      this.reusableTree = tree || undefined;
    };

    function* process(
      result: CollateStageResult<V, L>,
    ): Iterable<ProcessStageResult<V, L>> {
      const treeToUse = getReusableTree();

      switch (result.type) {
        case "lowerBound":
        case "terminal":
        case "done":
          setReusableTree(null);
          yield (result);
          break;

        case "fingerprint": {
          // If the fingerprint is not neutral, compare it with our own fingeprint of this range.
          const { fingerprint, size, items, nextTree } = tree.getFingerprint(
            result.lowerBound,
            result.upperBound,
            treeToUse,
          );

          setReusableTree(nextTree);

          // If the fingeprints match, we've reconciled this range. Hooray!
          if (fingerprint === result.fingerprint) {
            yield ({
              "type": "done",
              upperBound: result.upperBound,
            });
            break;
          }

          // If it doesn't, check how many items are in the non-matching range...
          // TODO: make k configurable.
          const k = 1;

          if (size <= k) {
            // If we have zero items in this range,
            //  Send an empty payload
            if (size === 0) {
              yield ({
                type: "emptyPayload",
                upperBound: result.upperBound,
              });
            }

            // Otherwise, send a payload for each item here.
            for (let i = 0; i < size; i++) {
              yield ({
                type: "payload",
                payload: items[i],
                ...(i === items.length - 1
                  ? {
                    end: { upperBound: result.upperBound, canRespond: true },
                  }
                  : {}),
              });
            }
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

            const b = 2;

            const chunkSize = Math.ceil(size / b);

            if (chunkSize <= k) {
              for (let i = 0; i < size; i++) {
                yield ({
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

              break;
            }

            let reusableTreeForChunks = undefined;

            for (let i = 0; i < size; i += chunkSize) {
              const rangeBeginning = itemsToUse[i];
              const rangeEnd = itemsToUse[i + chunkSize] || result.upperBound;

              const { fingerprint: chunkFingerprint, nextTree } = tree
                .getFingerprint(
                  rangeBeginning,
                  rangeEnd,
                  reusableTreeForChunks,
                );

              reusableTreeForChunks = changedItems
                ? undefined
                : nextTree || undefined;

              yield ({
                type: "fingerprint",
                fingerprint: chunkFingerprint,
                upperBound: rangeEnd,
              });
            }
          }

          break;
        }

        case "payload": {
          // If we can respond, send back payloads for everything in this range we have.
          if (result.end.canRespond) {
            const { items, size, nextTree } = tree.getFingerprint(
              result.lowerBound,
              result.end.upperBound,
              treeToUse,
            );

            setReusableTree(nextTree);

            if (size === 0) {
              yield ({
                type: "emptyPayload",
                upperBound: result.end.upperBound,
              });
            }

            for (let i = 0; i < size; i++) {
              yield ({
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
          } else {
            // Or are we done here...
            setReusableTree(null);

            yield ({
              type: "done",
              upperBound: result.end.upperBound,
            });
          }

          // add all items in the payload to the tree
          for (const payloadItem of result.payload) {
            tree.insert(payloadItem);
          }

          break;
        }

        case "emptyPayload": {
          setReusableTree(null);

          const { items, size, nextTree } = tree.getFingerprint(
            result.lowerBound,
            result.upperBound,
            //treeToUse,
          );

          setReusableTree(nextTree);

          if (size === 0) {
            setReusableTree(null);
            break;
          }

          for (let i = 0; i < size; i++) {
            yield ({
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

          break;
        }
      }
    }

    const setLastDoneUpperBound = (bound: V | null) => {
      this.lastDoneUpperBound = bound;
    };

    const getLastDoneUpperBound = () => this.lastDoneUpperBound;

    function* consolidateAdjacentDoneStage(
      result: ProcessStageResult<V, L>,
    ): Iterable<ProcessStageResult<V, L>> {
      switch (result.type) {
        case "done": {
          setLastDoneUpperBound(result.upperBound);

          break;
        }

        default: {
          const lastDoneUpperBound = getLastDoneUpperBound();

          if (lastDoneUpperBound) {
            yield ({
              "type": "done",
              upperBound: lastDoneUpperBound,
            });

            setLastDoneUpperBound(null);
          }

          yield (result);
        }
      }
    }

    // In the fifth stage we check if all messages are pretty much done.

    const setIsReallyDone = (isDone: boolean) => {
      this.isReallyDone = isDone;
    };

    const getIsReallyDone = () => this.isReallyDone;

    const setIsDoneSoFar = (isDone: boolean) => {
      this.isDoneSoFar = isDone;
    };

    const getIsDoneSoFar = () => this.isDoneSoFar;

    const isDoneTee = this.isDoneTee;

    function* isDoneStage(message: DecodeStageResult<V, L>): Iterable<
      DecodeStageResult<V, L>
    > {
      if (!getIsReallyDone()) {
        yield (message);
      }

      switch (message.type) {
        case "lowerBound":
          setIsDoneSoFar(true);
          break;
        case "fingerprint":
          setIsDoneSoFar(false);
          break;
        case "emptyPayload":
          setIsDoneSoFar(false);
          break;
        case "payload":
          if (message.end?.canRespond === true) {
            setIsDoneSoFar(false);
          }
          break;
        case "terminal":
          if (getIsDoneSoFar()) {
            setIsReallyDone(true);
            isDoneTee.resolve();
          } else {
            setIsDoneSoFar(true);
          }
      }
    }

    // In the sixth stage af the pipeline we encode the messages.

    function* encodeStage(message: ProcessStageResult<V, L>): Iterable<E> {
      let encoded: E;

      switch (message.type) {
        case "lowerBound": {
          encoded = config.encode.lowerBound(message.value);

          break;
        }
        case "done": {
          encoded = config.encode.done(message.upperBound);
          break;
        }
        case "fingerprint": {
          encoded = config.encode.fingerprint(
            message.fingerprint,
            message.upperBound,
          );
          break;
        }
        case "payload": {
          encoded = config.encode.payload(message.payload, message.end);
          break;
        }
        case "emptyPayload": {
          encoded = config.encode.emptyPayload(message.upperBound);
          break;
        }
        case "terminal": {
          encoded = config.encode.terminal();
          break;
        }
      }

      yield (encoded);
    }

    const pipeline = new MessagePipeline([message])
      .pipeThrough(decode)
      .pipeThrough(isDoneStage)
      .pipeThrough(collatePayloadsStage)
      .pipeThrough(process)
      .pipeThrough(consolidateAdjacentDoneStage)
      .pipeThrough(encodeStage);

    return pipeline.iterable;
  }

  isDone() {
    return this.isDoneTee.tee();
  }

  initialEvents(): Iterable<E> {
    const { tree, config } = this;

    function* initiatingElements(): Iterable<E> {
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
      const fullRange = tree.getFullRange();

      const lowerEncoded = config.encode.lowerBound(fullRange.x);

      yield lowerEncoded;

      const { items, size } = tree.getFingerprint(
        fullRange.x,
        fullRange.x,
      );

      const k = 1;

      if (size <= k) {
        // If we have zero items in this range,  send all items we have from here.
        if (size === 0) {
          const emptyEncoded = config.encode.emptyPayload(fullRange.x);
          yield emptyEncoded;
        }

        // Otherwise, send a payload for each item here.
        for (let i = 0; i < items.length; i++) {
          const payloadEncoded = config.encode.payload(
            items[i],
            i === items.length - 1
              ? {
                upperBound: fullRange.x,
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

          const rangeEnd = items[i + chunkSize] || fullRange.x;

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

class MessagePipeline<I> {
  iterable: Iterable<I>;

  constructor(i: Iterable<I>) {
    this.iterable = i;
  }

  pipeThrough<O>(processor: (i: I) => Iterable<O>): MessagePipeline<O> {
    const iterable = this.iterable;

    function* nextIterator() {
      for (const item of iterable) {
        for (const result of processor(item)) {
          yield result;
        }
      }
    }

    return new MessagePipeline(nextIterator());
  }
}
