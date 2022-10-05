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

export type Fingerprint = Uint8Array;

export type RangeSeries<ValueType> = [
  ValueType,
  ValueType[],
  ValueType,
];

export type RangeItem<ValueType, LiftedType, NeutralType> =
  | "done"
  | NeutralType
  | LiftedType
  | ValueType[];

export type RangeMessage<V, L, N> = [
  [RangeItem<V, L, N>, V],
  [RangeItem<V, L, N>, V][],
  RangeItem<V, L, N>,
];

export type RangeMessageEncoded = string;

export type Monoid<ValueType, LiftType, NeutralType> = {
  lift: (i: ValueType) => LiftType;
  combine: (
    a: LiftType | NeutralType,
    b: LiftType | NeutralType,
  ) => LiftType | NeutralType;
  neutral: NeutralType;
};
