import { DocThumbnailDecoded, DocThumbnailEncoded } from "./types.ts";

export function encodeDocThumbnail(
  thumbnail: DocThumbnailDecoded,
): DocThumbnailEncoded {
  return `${thumbnail.path} ${thumbnail.author} ${thumbnail.timestamp}`;
}

export function decodeDocThumbnail(
  thumbnail: DocThumbnailEncoded,
): DocThumbnailDecoded {
  const [path, author, timestamp] = thumbnail.split(" ");

  if (!path || !author || !timestamp) {
    throw ("Couldn't get thumbnail parts");
  }

  return { path, author, timestamp: parseInt(timestamp) };
}
