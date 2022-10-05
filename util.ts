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

export function labelToString(uint8: Uint8Array): string {
  const view = new DataView(uint8.buffer, 0);

  return view.getUint32(0, true).toString(16);
}
