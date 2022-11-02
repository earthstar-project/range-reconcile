export type RangeMessengerConfig<EncodedType, ValueType, LiftType> = {
  encode: {
    emptySet: (canRespond: boolean) => EncodedType;
    lowerBound: (value: ValueType) => EncodedType;
    payload: (
      value: ValueType,
      end?: { canRespond: boolean; upperBound: ValueType },
    ) => EncodedType;
    emptyPayload: (upperBound: ValueType) => EncodedType;
    done: (upperBound: ValueType) => EncodedType;
    fingerprint: (
      fingerprint: LiftType,
      upperBound: ValueType,
    ) => EncodedType;
    terminal: () => EncodedType;
  };
  decode: {
    emptySet: (message: EncodedType) => boolean;
    lowerBound: (message: EncodedType) => ValueType;
    payload: (
      message: EncodedType,
    ) => {
      value: ValueType;
      end?: { canRespond: boolean; upperBound: ValueType };
    };
    /** Returns the upper bound of the message */
    emptyPayload: (message: EncodedType) => ValueType;
    /** Returns the upper bound of the message */
    done: (message: EncodedType) => ValueType;
    fingerprint: (
      message: EncodedType,
    ) => { fingerprint: LiftType; upperBound: ValueType };
    terminal: (e: EncodedType) => true;
  };
};

type ObjEncoding<V, L> =
  | {
    type: "emptySet";
    canRespond: boolean;
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

export const objConfig: RangeMessengerConfig<
  ObjEncoding<string, string>,
  string,
  string
> = {
  encode: {
    emptySet: (canRespond) => ({
      type: "emptySet",
      canRespond,
    }),
    lowerBound: (x) => ({
      type: "lowerBound",
      value: x,
    }),
    payload: (v, end) => ({
      type: "payload",
      payload: v,
      ...(end ? { end } : {}),
    }),
    emptyPayload: (upperBound) => ({
      type: "emptyPayload",
      upperBound,
    }),
    done: (y) => ({
      type: "done",
      upperBound: y,
    }),
    fingerprint: (fp, y) => ({
      type: "fingerprint",
      fingerprint: fp,
      upperBound: y,
    }),
    terminal: () => ({
      type: "terminal",
    }),
  },
  decode: {
    emptySet: (obj) => {
      if (obj.type === "emptySet") {
        return obj.canRespond;
      }

      throw "Couldn't decode";
    },
    lowerBound: (obj) => {
      if (obj.type === "lowerBound") {
        return obj.value;
      }

      throw "Couldn't decode";
    },

    payload: (obj) => {
      if (obj.type === "payload") {
        return {
          value: obj.payload,
          ...(obj.end ? { end: obj.end } : {}),
        };
      }

      throw "Couldn't decode";
    },

    emptyPayload: (obj) => {
      if (obj.type === "emptyPayload") {
        return obj.upperBound;
      }

      throw "Couldn't decode";
    },

    done: (obj) => {
      if (obj.type === "done") {
        return obj.upperBound;
      }

      throw "Couldn't decode";
    },
    fingerprint: (obj) => {
      if (obj.type === "fingerprint") {
        return {
          fingerprint: obj.fingerprint,
          upperBound: obj.upperBound,
        };
      }

      throw "Couldn't decode";
    },
    terminal: (obj) => {
      if (obj.type === "terminal") {
        return true;
      }

      throw "Couldn't decode";
    },
  },
};

/*
export const jsonConfig: RangeMessengerConfig<string, string, string> = {
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
    emptyPayload: (upperBound) =>
      JSON.stringify({
        msg: "EMPTY_PAYLOAD",
        upperBound,
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

    emptyPayload: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "EMPTY_PAYLOAD") {
        return parsed["upperBound"];
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
*/
