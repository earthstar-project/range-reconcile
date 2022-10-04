export type DocThumbnailEncoded = string;

export type DocThumbnailDecoded = {
  path: string;
  author: string;
  timestamp: number;
};

export type ExchangeScenario = {
  a: DocThumbnailDecoded[];
  b: DocThumbnailDecoded[];
};

export type RangeSeries = [
  DocThumbnailEncoded | null,
  DocThumbnailEncoded[],
  DocThumbnailEncoded | null,
];

export type Fingerprint = Uint8Array;

export type RangeItem =
  | "done"
  | 0
  | DocThumbnailEncoded
  | DocThumbnailEncoded[];

export type RangePair = [RangeItem, Fingerprint];

export type RangeMessage = [
  Fingerprint,
  [[RangeItem, Fingerprint][]],
];

// must start with a fingerprint
// must be followed by

export type RangeMessageEncoded = string;
