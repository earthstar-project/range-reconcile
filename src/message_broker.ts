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

  process(incoming: AsyncIterable<E>): AsyncIterable<E> {
    const { tree, config } = this;

    let lowerBoundDecode: V;

    function* decode(message: E): Iterable<DecodeStageResult<V, L>> {
      const lowerBoundMsg = config.decode.lowerBound(message);

      if (lowerBoundMsg) {
        lowerBoundDecode = lowerBoundMsg;

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
          lowerBound: lowerBoundDecode,
          type: "done",
          upperBound: rangeDoneUpperBound,
        });
        lowerBoundDecode = rangeDoneUpperBound;
        return;
      }

      const fingerprintMsg = config.decode.fingerprint(message);

      if (fingerprintMsg) {
        yield ({
          "type": "fingerprint",
          lowerBound: lowerBoundDecode,
          fingerprint: fingerprintMsg.fingerprint,
          upperBound: fingerprintMsg.upperBound,
        });
        lowerBoundDecode = fingerprintMsg.upperBound;
        return;
      }

      const payloadMsg = config.decode.payload(message);

      if (payloadMsg) {
        yield ({
          "type": "payload",
          lowerBound: lowerBoundDecode,
          "payload": payloadMsg.value,
          ...(payloadMsg.end ? { end: payloadMsg.end } : {}),
        });

        if (payloadMsg.end) {
          lowerBoundDecode = payloadMsg.end.upperBound;
        }
        return;
      }

      const emptyPayloadMsg = config.decode.emptyPayload(message);

      if (emptyPayloadMsg) {
        yield ({
          lowerBound: lowerBoundDecode,
          "type": "emptyPayload",
          upperBound: emptyPayloadMsg,
        });

        lowerBoundDecode = emptyPayloadMsg;
        return;
      }
    }

    // In the second stage of the pipeline we need to consolidate all payload messages into a single message with all items included.

    let collatedPayload: {
      lowerBound: V;
      type: "payload";
      payload: V[];
      end: { canRespond: boolean; upperBound: V };
    } | null = null;

    function* collatePayloadsStage(
      decoded: DecodeStageResult<V, L>,
    ): Iterable<CollateStageResult<V, L>> {
      {
        switch (decoded.type) {
          case "payload": {
            if (collatedPayload === null) {
              collatedPayload = {
                type: "payload",
                lowerBound: decoded.lowerBound,
                payload: [],
                end: { canRespond: false, upperBound: decoded.payload },
              };
            }

            collatedPayload.payload.push(decoded.payload);

            if (decoded.end) {
              collatedPayload.end = decoded.end;
              yield (collatedPayload);
              collatedPayload = null;
            }

            break;
          }
          default: {
            if (collatedPayload) {
              // This shouldn't happen.
              collatedPayload = null;
            }

            yield (decoded);
          }
        }
      }
    }

    // In the third stage of the pipeline we formulate our response to these messages, as well as perform tree insertions.
    let reusableTree: NodeType<V, L> | undefined = undefined;

    function* process(
      result: CollateStageResult<V, L>,
    ): Iterable<ProcessStageResult<V, L>> {
      switch (result.type) {
        case "lowerBound":
        case "terminal":
        case "done":
          reusableTree = undefined;
          yield (result);
          break;

        case "fingerprint": {
          // If the fingerprint is not neutral, compare it with our own fingeprint of this range.
          const { fingerprint, size, items, nextTree } = tree.getFingerprint(
            result.lowerBound,
            result.upperBound,
            reusableTree,
          );

          reusableTree = nextTree || undefined;

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
          const k = 4;

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

            const b = 8;

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
              reusableTree,
            );

            reusableTree = nextTree || undefined;

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
            reusableTree = undefined;

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
          reusableTree = undefined;

          const { items, size, nextTree } = tree.getFingerprint(
            result.lowerBound,
            result.upperBound,
            reusableTree,
          );

          reusableTree = nextTree || undefined;

          if (size === 0) {
            reusableTree = undefined;
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

    // In the fourth stage of the pipeline we consolidate adjacent done ranges together
    let lastDoneUpperBound: V | null = null;

    function* consolidateAdjacentDoneStage(
      result: ProcessStageResult<V, L>,
    ): Iterable<ProcessStageResult<V, L>> {
      switch (result.type) {
        case "done": {
          lastDoneUpperBound = result.upperBound;

          break;
        }

        default: {
          if (lastDoneUpperBound) {
            yield ({
              "type": "done",
              upperBound: lastDoneUpperBound,
            });

            lastDoneUpperBound = null;
          }

          yield (result);
        }
      }
    }

    // In the fifth stage we check if all messages are pretty much done.

    let isDoneSoFar = true;
    let isReallyDone = false;
    const isDoneTee = this.isDoneTee;

    function* isDoneStage(message: DecodeStageResult<V, L>): Iterable<
      DecodeStageResult<V, L>
    > {
      if (!isReallyDone) {
        yield (message);
      }

      switch (message.type) {
        case "lowerBound":
          isDoneSoFar = true;
          break;
        case "fingerprint":
          isDoneSoFar = false;
          break;
        case "emptyPayload":
          isDoneSoFar = false;
          break;
        case "payload":
          if (message.end?.canRespond === true) {
            isDoneSoFar = false;
          }
          break;
        case "terminal":
          if (isDoneSoFar) {
            isReallyDone = true;
            isDoneTee.resolve();
          } else {
            isDoneSoFar = true;
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

    const pipeline = new AsyncPipeline(incoming)
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

class AsyncPipeline<I> {
  iterable: AsyncIterable<I>;

  constructor(i: AsyncIterable<I>) {
    this.iterable = i;
  }

  pipeThrough<O>(processor: (i: I) => Iterable<O>): AsyncPipeline<O> {
    const iterable = this.iterable;

    async function* nextIterator() {
      for await (const item of iterable) {
        for (const result of processor(item)) {
          yield result;
        }
      }
    }

    return new AsyncPipeline(nextIterator());
  }
}
