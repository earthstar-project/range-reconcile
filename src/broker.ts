import { FingerprintTree } from "./fingerprint_tree.ts";

type BrokerConfig<EncodedType, ValueType, LiftType, NeutralType> = {
  encode: {
    lowerBound: (value: ValueType) => EncodedType;
    payload: (
      value: ValueType,
      end?: { canRespond: boolean; upperBound: ValueType },
    ) => EncodedType;
    done: (upperBound: ValueType) => EncodedType;
    fingerprint: (
      fingerprint: LiftType | NeutralType,
      upperBound: ValueType,
    ) => EncodedType;
    terminal: () => EncodedType;
  };
  decode: {
    lowerBound: (message: EncodedType) => ValueType;
    payload: (
      message: EncodedType,
    ) => {
      value: ValueType;
      end?: { canRespond: boolean; upperBound: ValueType };
    } | false;
    /** Returns the upper bound of the message */
    done: (message: EncodedType) => ValueType | false;
    fingerprint: (
      message: EncodedType,
    ) => { fingerprint: LiftType | NeutralType; upperBound: ValueType } | false;
    terminal: (e: EncodedType) => boolean;
  };
};

type DecodeStageResult<V, L, N> =
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
    fingerprint: L | N;
    upperBound: V;
  }
  | { lowerBound: V; type: "done"; upperBound: V }
  | { type: "terminal" };

type CollateStageResult<V, L, N> =
  | Exclude<DecodeStageResult<V, L, N>, {
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

type ProcessStageResult<V, L, N> =
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
    fingerprint: L | N;
    upperBound: V;
  }
  | { type: "done"; upperBound: V }
  | { type: "terminal" };

export class Broker<E, V, L, N> {
  private passthrough = new TransformStream<E, E>({
    transform(message, controller) {
      controller.enqueue(message);
    },
  });

  private passthrough2 = new TransformStream<E, E>({
    transform(message, controller) {
      controller.enqueue(message);
    },
  });

  writable = this.passthrough.writable;
  readable = this.passthrough2.readable;

  constructor(
    tree: FingerprintTree<V, L, N>,
    config: BrokerConfig<E, V, L, N>,
  ) {
    let lowerBoundDecode: V | null = null;

    // Build a pipeline which incoming messages going in and response messages coming out.
    // First step of pipeline is decoding. What kind of message is it?

    const decodeStage = new TransformStream<E, DecodeStageResult<V, L, N>>(
      {
        transform(message, controller) {
          if (lowerBoundDecode === null) {
            lowerBoundDecode = config.decode.lowerBound(message);

            controller.enqueue({ type: "lowerBound", value: lowerBoundDecode });
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
              ...(payloadMsg.end),
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
      DecodeStageResult<V, L, N>,
      CollateStageResult<V, L, N>
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

    const processStage = new TransformStream<
      CollateStageResult<V, L, N>,
      ProcessStageResult<V, L, N>
    >({
      transform(result, controller) {
        switch (result.type) {
          case "lowerBound":
          case "terminal":
          case "done":
            controller.enqueue(result);
            break;

          case "fingerprint": {
            // If fingeprint is neutral element
            if (tree.monoid.neutral[0] === result.fingerprint) {
              // Send back all items.
              const { items } = tree.getFingerprint(
                result.lowerBound,
                result.upperBound,
              );

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
            const { fingerprint, size, items } = tree.getFingerprint(
              result.lowerBound,
              result.upperBound,
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
              // if it's > k then divide ranges (could be divided into 2 or more depending on number of items, define this with b.)
              for (let i = 0; i < items.length; i += b) {
                // calculate fingerprint with
                const rangeBeginning = items[i];
                const rangeEnd = items[i + b + 1] || result.upperBound;

                const { fingerprint } = tree.getFingerprint(
                  rangeBeginning,
                  rangeEnd,
                );

                controller.enqueue({
                  type: "fingerprint",
                  fingerprint: fingerprint,

                  upperBound: rangeEnd,
                });
              }
            }

            break;
          }

          case "payload": {
            // check whether this payload can be responded to
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
            }

            // add all items in the payload to the tree
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
      ProcessStageResult<V, L, N>,
      ProcessStageResult<V, L, N>
    >({
      transform(result, controller) {
        switch (result.type) {
          case "done": {
            if (lastDoneUpperBound === null) {
              lastDoneUpperBound = result.upperBound;
            }
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

    // In the fifth stage af the pipeline we encode the messages.

    const encodeStage = new TransformStream<ProcessStageResult<V, L, N>, E>({
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
    this.passthrough.readable.pipeThrough(decodeStage).pipeThrough(
      collatePayloadsStage,
    ).pipeThrough(processStage).pipeThrough(consolidateAdjacentDoneStage)
      .pipeThrough(encodeStage).pipeThrough(this.passthrough2);
  }
}
