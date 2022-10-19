import {
  decode,
  encode,
} from "https://deno.land/std@0.158.0/encoding/base64.ts";

export type MessageBrokerConfig<EncodedType, ValueType, LiftType> = {
  encode: {
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
    lowerBound: (message: EncodedType) => ValueType | false;
    payload: (
      message: EncodedType,
    ) => {
      value: ValueType;
      end?: { canRespond: boolean; upperBound: ValueType };
    } | false;
    /** Returns the upper bound of the message */
    emptyPayload: (message: EncodedType) => ValueType | false;
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

export const uint8TestConfig: MessageBrokerConfig<
  string,
  Uint8Array,
  Uint8Array
> = {
  encode: {
    lowerBound: (x) =>
      JSON.stringify({
        msg: "LOWER",
        x: encode(x),
      }),
    payload: (v, end) =>
      JSON.stringify({
        msg: "PAYLOAD",
        payload: encode(v),
        ...(end
          ? {
            end: {
              canRespond: end.canRespond,
              upperBound: encode(end.upperBound),
            },
          }
          : {}),
      }),
    emptyPayload: (upperBound) =>
      JSON.stringify({
        msg: "EMPTY_PAYLOAD",
        upperBound: encode(upperBound),
      }),
    done: (y) =>
      JSON.stringify({
        msg: "DONE",
        y: encode(y),
      }),
    fingerprint: (fp, y) =>
      JSON.stringify({
        msg: "FINGERPRINT",
        fingerprint: encode(fp),
        y: encode(y),
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
        return decode(parsed["x"]);
      }

      return false;
    },

    payload: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "PAYLOAD") {
        return {
          value: decode(parsed["payload"]),
          ...(parsed["end"]
            ? {
              end: {
                canRespond: parsed["end"]["canRespond"],
                upperBound: decode(parsed["end"]["upperBound"]),
              },
            }
            : {}),
        };
      }

      return false;
    },

    emptyPayload: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "EMPTY_PAYLOAD") {
        return decode(parsed["upperBound"]);
      }

      return false;
    },

    done: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "DONE") {
        return decode(parsed["y"]);
      }

      return false;
    },
    fingerprint: (json) => {
      const parsed = JSON.parse(json);

      if (parsed["msg"] === "FINGERPRINT") {
        return {
          fingerprint: decode(parsed["fingerprint"]),
          upperBound: decode(parsed["y"]),
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
