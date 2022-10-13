export type MessageBrokerConfig<EncodedType, ValueType, LiftType> = {
  encode: {
    lowerBound: (value: ValueType | null) => EncodedType;
    payload: (
      value: ValueType,
      end?: { canRespond: boolean; upperBound: ValueType },
    ) => EncodedType;
    done: (upperBound: ValueType) => EncodedType;
    fingerprint: (
      fingerprint: LiftType,
      upperBound: ValueType | null,
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
    ) => { fingerprint: LiftType; upperBound: ValueType } | false;
    terminal: (e: EncodedType) => boolean;
  };
};

export const testConfig: MessageBrokerConfig<string, string, string> = {
  encode: {
    lowerBound: (x) =>
      JSON.stringify({
        msg: "LOWER",
        x: x,
      }),
    payload: (v, end) =>
      JSON.stringify({
        msg: "PAYLOAD",
        payload: v,
        ...(end ? { end } : {}),
      }),
    done: (y) =>
      JSON.stringify({
        msg: "DONE",
        y: y,
      }),
    fingerprint: (fp, y) =>
      JSON.stringify({
        msg: "FINGERPRINT",
        fingerprint: fp,
        y: y,
      }),
    terminal: () =>
      JSON.stringify({
        msg: "TERMINAL",
      }),
  },
  decode: {
    lowerBound: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "LOWER") {
        return parsed["x"];
      }

      return false;
    },

    payload: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "PAYLOAD") {
        return {
          value: parsed["payload"],
          ...(parsed["end"] ? { end: parsed["end"] } : {}),
        };
      }

      return false;
    },
    done: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "DONE") {
        return parsed["y"];
      }

      return false;
    },
    fingerprint: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "FINGERPRINT") {
        return {
          fingerprint: parsed["fingerprint"],
          upperBound: parsed["y"],
        };
      }

      return false;
    },
    terminal: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "TERMINAL") {
        return true;
      }

      return false;
    },
  },
};
