import { DeferredTee } from "./deferred_tee.ts";
import { FingerprintTree } from "./fingerprint_tree.ts";
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

          const k = 1;

          if (size <= k) {
            // If we have zero items in this range,  send all items we have from here.
            if (size === 0) {
              const emptyEncoded = config.encode.emptyPayload(fullRange.x);
              controller.enqueue(emptyEncoded);
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

              controller.enqueue(payloadEncoded);
            }
          } else {
            const b = 1;

            const chunkSize = Math.ceil(size / b);

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
          }

          const terminalEncoded = config.encode.terminal();
          controller.enqueue(terminalEncoded);
        }
      },
    }, new CountQueuingStrategy({ highWaterMark: 100000 }));

    this.readable = passthrough2.readable;

    let lowerBoundDecode: V;

    // Build a pipeline which incoming messages going in and response messages coming out.
    // First step of pipeline is decoding. What kind of message is it?

    const decodeStage = new TransformStream<E, DecodeStageResult<V, L>>(
      {
        transform(message, controller) {
          const lowerBoundMsg = config.decode.lowerBound(message);

          if (lowerBoundMsg) {
            lowerBoundDecode = lowerBoundMsg;

            // Stop processing of this message here, we no longer need it.
            controller.enqueue({
              "type": "lowerBound",
              value: lowerBoundMsg,
            });

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
            return;
          }

          const emptyPayloadMsg = config.decode.emptyPayload(message);

          if (emptyPayloadMsg) {
            controller.enqueue({
              lowerBound: lowerBoundDecode,
              "type": "emptyPayload",
              upperBound: emptyPayloadMsg,
            });

            lowerBoundDecode = emptyPayloadMsg;
            return;
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
              collatedPayload = null;
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
    // DO NOTE USE THIS UNTIL TESTS PASS AGAIN
    //let treeToUse: NodeType<V, L> | undefined = undefined;

    const processStage = new TransformStream<
      CollateStageResult<V, L>,
      ProcessStageResult<V, L>
    >({
      transform(result, controller) {
        switch (result.type) {
          case "lowerBound":
          case "terminal":
          case "done":
            //treeToUse = undefined;
            controller.enqueue(result);
            break;

          case "fingerprint": {
            // If the fingerprint is not neutral, compare it with our own fingeprint of this range.
            const { fingerprint, size, items } = tree.getFingerprint(
              result.lowerBound,
              result.upperBound,
            );

            // If the fingeprints match, we've reconciled this range. Hooray!
            if (fingerprint === result.fingerprint) {
              controller.enqueue({
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
                controller.enqueue({
                  type: "emptyPayload",
                  upperBound: result.upperBound,
                });
                break;
              }

              // Otherwise, send a payload for each item here.
              for (let i = 0; i < size; i++) {
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
              // If we have more than k items, we want to divide the range into b parts.
              // TODO: make b configurable

              let itemsToUse = items;

              if (result.lowerBound >= result.upperBound) {
                // Search for the lower bound in items.
                const indexOfLowerBound = items.indexOf(result.lowerBound);

                if (indexOfLowerBound > 0) {
                  const newStart = items.slice(indexOfLowerBound);
                  const newEnd = items.slice(0, indexOfLowerBound);

                  itemsToUse = [...newStart, ...newEnd];
                }
              }

              const b = 2;

              const chunkSize = Math.ceil(size / b);

              if (chunkSize <= k) {
                for (let i = 0; i < size; i++) {
                  controller.enqueue({
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

              for (let i = 0; i < size; i += chunkSize) {
                // For each chunk...

                const rangeBeginning = itemsToUse[i];

                // if the
                const rangeEnd = itemsToUse[i + chunkSize] || result.upperBound;

                const { fingerprint: chunkFingerprint } = tree
                  .getFingerprint(
                    rangeBeginning,
                    rangeEnd,
                  );

                controller.enqueue({
                  type: "fingerprint",
                  fingerprint: chunkFingerprint,
                  upperBound: rangeEnd,
                });
              }
            }

            //treeToUse = nextTree || undefined;

            break;
          }

          case "payload": {
            // If we can respond, send back payloads for everything in this range we have.
            if (result.end.canRespond) {
              const { items, size } = tree.getFingerprint(
                result.lowerBound,
                result.end.upperBound,
                //treeToUse,
              );

              if (size === 0) {
                controller.enqueue({
                  type: "emptyPayload",
                  upperBound: result.end.upperBound,
                });
              }

              for (let i = 0; i < size; i++) {
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
            } else {
              // Or are we done here...

              controller.enqueue({
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
            const { items, size } = tree.getFingerprint(
              result.lowerBound,
              result.upperBound,
            );

            for (let i = 0; i < size; i++) {
              controller.enqueue({
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

          default: {
            /*
            if (
              result.type === "fingerprint" || result.type === "emptyPayload"
            ) {
              if (result.upperBound === lastDoneUpperBound) {
                lastDoneUpperBound = null;
              }
            } else if (result.type === "payload") {
              if (result.end?.upperBound === lastDoneUpperBound) {
                lastDoneUpperBound = null;
              }
            } else

            */ if (lastDoneUpperBound) {
              controller.enqueue({
                "type": "done",
                upperBound: lastDoneUpperBound,
              });

              lastDoneUpperBound = null;
            }

            controller.enqueue(result);
          }
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
          case "emptyPayload": {
            encoded = config.encode.emptyPayload(message.upperBound);
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
