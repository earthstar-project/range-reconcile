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

export type RangeSeries<ValueType> = [
  ValueType | null,
  ValueType[],
  ValueType | null,
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

export type Monoid<ValueType, LiftType, NeutralType> = {
  lift: (i: ValueType) => LiftType;
  combine: (
    a: LiftType | NeutralType,
    b: LiftType | NeutralType,
  ) => LiftType | NeutralType;
  neutral: NeutralType;
  oneBigger: (i: ValueType) => ValueType;
};
