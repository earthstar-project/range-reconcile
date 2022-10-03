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
