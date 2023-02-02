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
    getType: (
      message: EncodedType,
    ) =>
      | "emptySet"
      | "lowerBound"
      | "payload"
      | "emptyPayload"
      | "done"
      | "fingerprint"
      | "terminal";
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
    getType: (obj) => {
      if ("type" in obj === false) {
        throw "Can't determine type";
      }

      return obj.type;
    },
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
