import { FingerprintTree } from "./fingerprint_tree.ts";
import {
  RangeItem,
  RangeMessage,
  RangeMessageEncoded,
  RangeSeries,
} from "./types.ts";

export class Broker<V, L, N> {
  private tree: FingerprintTree<V, L, N>;
  private decoder: {
    decodeValue: (v: string) => V;
    decodeRangeItem: (i: string) => RangeItem<V, L, N>;
  };

  constructor(tree: FingerprintTree<V, L, N>, decoder: {
    decodeValue: (v: string) => V;
    decodeRangeItem: (i: string) => RangeItem<V, L, N>;
  }) {
    this.tree = tree;
    this.decoder = decoder;
  }

  respond(message: RangeMessageEncoded): RangeMessageEncoded {
    // Parse the message into a RangeMessage

    // Assume a message is delimited by spaces
    const parts = message.split(" ");

    if (parts.length < 3) {
      throw new Error("Bad message passed: not enough parts");
    }

    const [h1, h2, ...rest] = parts;

    const middle: [RangeItem<V, L, N>, V][] = [];

    if (rest.length > 1) {
      for (let i = 0; i < rest.length - 1; i += 2) {
        const item = this.decoder.decodeRangeItem(rest[i]);
        const value = this.decoder.decodeValue(rest[i + 1]);

        middle.push([item, value]);
      }
    }

    // Decode all the bits...
    const rangeMessage: RangeMessage<V, L, N> = [
      [
        this.decoder.decodeRangeItem(h1),
        this.decoder.decodeValue(h2),
      ],
      middle,
      this.decoder.decodeRangeItem(rest[rest.length - 1]),
    ];

    // Transform RangeMessage into RangeSeries
    const rangeSeriesParts: RangeSeries<V> = rangeMessageToSeries(rangeMessage);

    // getFingerprint of RangeSeries
    // TODO: we don't want to calculate fingerprints for 'done', NeutralType,
    const fingerprints = this.tree.getFingerPrints(rangeSeriesParts);

    // Compare result with RangeMessage
    // for each range in the range message..

    // Create new RangeMessage

    // Encode and return

    return "hey!!!";
  }
}

function rangeMessageToSeries<V, L, N>(
  message: RangeMessage<V, L, N>,
): RangeSeries<V> {
  const head = message[0][1];

  const middle: V[] = [];
  let tail: V = head;

  if (message[1].length > 0) {
    for (let i = 0; i < message[1].length - 1; i++) {
      const v = message[1][i][1];

      if (i < message[1].length - 1) {
        tail = v;
      } else {
        middle.push(v);
      }
    }
  }

  return [
    head,
    middle,
    tail,
  ];
}
