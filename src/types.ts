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
