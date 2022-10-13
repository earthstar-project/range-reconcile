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
    end?: { canRespond: boolean; upperBound: V };
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
    type: "fingerprint";
    fingerprint: L;
    upperBound: V;
  }
  | { type: "done"; upperBound: V }
  | { type: "terminal" };

export class MessageBroker<E, V, L> {
  private passthrough = new TransformStream<E, E>({
    transform(message, controller) {
      controller.enqueue(message);
    },
  });

  writable = this.passthrough.writable;
  readable: ReadableStream<E>;

  private isDoneTee = new DeferredTee();

  constructor(
    tree: FingerprintTree<V, L>,
    config: MessageBrokerConfig<E, V, L>,
    initiateExchange = false,
  ) {
    const passthrough2 = new TransformStream<E, E>({
      transform(message, controller) {
        controller.enqueue(message);
      },
      start(controller) {
        if (initiateExchange) {
          if (tree.size === 0) {
            const lowerEncoded = config.encode.lowerBound(null);
            const fingerprintEncoded = config.encode.fingerprint(
              tree.monoid.neutral[0],
              null,
            );
            const terminalEncoded = config.encode.terminal();

            controller.enqueue(lowerEncoded);
            controller.enqueue(fingerprintEncoded);
            controller.enqueue(terminalEncoded);

            return;
          }

          // TODO: split fingerprint in two (make this configurable with b)
          const fullRange = tree.getFullRange();

          const lowerEncoded = config.encode.lowerBound(fullRange.x);
          controller.enqueue(lowerEncoded);

          const { items, size, fingerprint } = tree.getFingerprint(
            fullRange.x,
            fullRange.x,
          );

          const b = 1;

          const chunkSize = Math.round(size / b);

          // if it's > k then divide ranges (could be divided into 2 or more depending on number of items, define this with b.)
          for (let i = 0; i < size; i += chunkSize) {
            // calculate fingerprint with
            const rangeEnd = items[i + chunkSize + 1] || fullRange.x;

            const fingerprintEncoded = config.encode.fingerprint(
              fingerprint,
              rangeEnd,
            );

            controller.enqueue(fingerprintEncoded);
          }

          const terminalEncoded = config.encode.terminal();
          controller.enqueue(terminalEncoded);
        }
      },
    });

    this.readable = passthrough2.readable;

    let lowerBoundDecode: V | null = null;

    // Build a pipeline which incoming messages going in and response messages coming out.
    // First step of pipeline is decoding. What kind of message is it?

    const decodeStage = new TransformStream<E, DecodeStageResult<V, L>>(
      {
        transform(message, controller) {
          if (lowerBoundDecode === null) {
            lowerBoundDecode = config.decode.lowerBound(message);

            controller.enqueue({
              "type": "lowerBound",
              value: lowerBoundDecode,
            });

            // Stop processing of this message here, we no longer need it.
            return;
          }

          const terminalMsg = config.decode.terminal(message);

          if (terminalMsg) {
            controller.enqueue({ "type": "terminal" });
            return;
          }

          const rangeDoneUpperBound = config.decode.done(message);

          if (rangeDoneUpperBound !== false) {
            controller.enqueue({
              lowerBound: lowerBoundDecode,
              type: "done",
              upperBound: rangeDoneUpperBound,
            });
            lowerBoundDecode = rangeDoneUpperBound;
            return;
          }

          const fingerprintMsg = config.decode.fingerprint(message);

          if (fingerprintMsg) {
            controller.enqueue({
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
            controller.enqueue({
              "type": "payload",
              lowerBound: lowerBoundDecode,
              "payload": payloadMsg.value,
              ...(payloadMsg.end ? { end: payloadMsg.end } : {}),
            });

            if (payloadMsg.end) {
              lowerBoundDecode = payloadMsg.end.upperBound;
            }
          }
        },
      },
    );

    // In the second stage of the pipeline we need to consolidate all payload messages into a single message with all items included.

    let collatedPayload: {
      lowerBound: V;
      type: "payload";
      payload: V[];
      end: { canRespond: boolean; upperBound: V };
    } | null = null;

    const collatePayloadsStage = new TransformStream<
      DecodeStageResult<V, L>,
      CollateStageResult<V, L>
    >({
      transform(decoded, controller) {
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
              controller.enqueue(collatedPayload);
            }
            break;
          }
          default: {
            if (collatedPayload) {
              // This shouldn't happen.
              collatedPayload = null;
            }

            controller.enqueue(decoded);
          }
        }
      },
    });

    // In the third stage of the pipeline we formulate our response to these messages, as well as perform tree insertions.
    let treeToUse: NodeType<V, L> | undefined = undefined;

    const processStage = new TransformStream<
      CollateStageResult<V, L>,
      ProcessStageResult<V, L>
    >({
      transform(result, controller) {
        switch (result.type) {
          case "lowerBound":
          case "terminal":
          case "done":
            // treeToUse = undefined;
            controller.enqueue(result);
            break;

          case "fingerprint": {
            // If fingeprint is neutral element
            if (tree.monoid.neutral[0] === result.fingerprint) {
              // Send back all items.
              const { items, nextTree } = tree.getFingerprint(
                result.lowerBound,
                result.upperBound,
                treeToUse,
              );

              treeToUse = nextTree || undefined;

              for (let i = 0; i < items.length; i++) {
                controller.enqueue({
                  type: "payload",
                  payload: items[i],
                  ...(i === items.length - 1
                    ? {
                      end: { upperBound: result.upperBound, canRespond: true },
                    }
                    : {}),
                });
              }

              break;
            }

            // Create own fingerprint of this range.
            // TODO: Use previous nextTree to make this more efficient.
            const { fingerprint, size, items, nextTree } = tree.getFingerprint(
              result.lowerBound,
              result.upperBound,
              treeToUse,
            );

            // If it matches, we are DONE here. Yay!
            if (fingerprint === result.fingerprint) {
              controller.enqueue({
                "type": "done",
                upperBound: result.upperBound,
              });
              break;
            }

            // If it doesn't, check how many items are in the non-matching range...

            // k must be at least 1
            // TODO: make k configurable.
            const k = 1;

            if (size <= k) {
              for (let i = 0; i < items.length; i++) {
                controller.enqueue({
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
              // TODO: make b configurable
              const b = 2;

              const chunkSize = Math.round(items.length / b);

              let treeToUseChunked = treeToUse;

              // if it's > k then divide ranges (could be divided into 2 or more depending on number of items, define this with b.)
              for (let i = 0; i < items.length; i += chunkSize) {
                // calculate fingerprint with
                const rangeBeginning = items[i];
                const rangeEnd = items[i + chunkSize] || result.upperBound;

                const { fingerprint, size, items: items2, nextTree } = tree
                  .getFingerprint(
                    rangeBeginning,
                    rangeEnd,
                    treeToUseChunked,
                  );

                treeToUseChunked = nextTree || undefined;

                if (size <= k) {
                  for (let i = 0; i < size; i++) {
                    controller.enqueue({
                      type: "payload",

                      payload: items2[i],
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
                } else {
                  controller.enqueue({
                    type: "fingerprint",
                    fingerprint: fingerprint,
                    upperBound: rangeEnd,
                  });
                }
              }

              treeToUse = nextTree || undefined;
            }

            break;
          }

          case "payload": {
            if (result.end?.canRespond) {
              // Send them back with canRespond: false.

              const { items } = tree.getFingerprint(
                result.lowerBound,
                result.end.upperBound,
              );

              for (let i = 0; i < items.length; i++) {
                controller.enqueue({
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
            } else if (result.end?.upperBound) {
              controller.enqueue({
                type: "done",
                upperBound: result.end.upperBound,
              });
            }

            // add all items in the payload to the tree
            // check whether this payload can be responded to
            for (const payloadItem of result.payload) {
              tree.insert(payloadItem);
            }

            break;
          }
        }
      },
    });

    // In the fourth stage of the pipeline we consolidate adjacent done ranges together
    let lastDoneUpperBound: V | null = null;

    const consolidateAdjacentDoneStage = new TransformStream<
      ProcessStageResult<V, L>,
      ProcessStageResult<V, L>
    >({
      transform(result, controller) {
        switch (result.type) {
          case "done": {
            lastDoneUpperBound = result.upperBound;

            break;
          }

          default:
            if (lastDoneUpperBound) {
              controller.enqueue({
                "type": "done",
                upperBound: lastDoneUpperBound,
              });

              lastDoneUpperBound = null;
            }

            controller.enqueue(result);
        }
      },
    });

    // In the fifth stage we check if all messages are pretty much done.

    let isDoneSoFar = true;
    let isReallyDone = false;
    const isDoneTee = this.isDoneTee;

    const isDoneStage = new TransformStream<
      DecodeStageResult<V, L>,
      DecodeStageResult<V, L>
    >({
      transform(message, controller) {
        if (!isReallyDone) {
          controller.enqueue(message);
        }

        switch (message.type) {
          case "lowerBound":
            isDoneSoFar = true;
            break;
          case "fingerprint":
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
      },
    });

    // In the sixth stage af the pipeline we encode the messages.

    const encodeStage = new TransformStream<ProcessStageResult<V, L>, E>({
      transform(message, controller) {
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
          case "terminal": {
            encoded = config.encode.terminal();
            break;
          }
        }

        controller.enqueue(encoded);
      },
    });

    // and then squirt 'em out

    this.passthrough.readable
      .pipeThrough(decodeStage)
      .pipeThrough(collatePayloadsStage)
      .pipeThrough(processStage)
      .pipeThrough(consolidateAdjacentDoneStage)
      .pipeThrough(isDoneStage)
      .pipeThrough(encodeStage)
      .pipeTo(passthrough2.writable);
  }

  isDone() {
    return this.isDoneTee.tee();
  }
}
