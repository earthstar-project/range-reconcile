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

export function compareDocThumbnail(
  thumbnailA: DocThumbnailEncoded,
  thumbnailB: DocThumbnailEncoded,
) {
  const a = decodeDocThumbnail(thumbnailA);
  const b = decodeDocThumbnail(thumbnailB);

  // Compare the paths first
  if (a.path < b.path) {
    return -1;
  }

  if (a.path > b.path) {
    return 1;
  }

  // If they match, compare authors

  if (a.author < b.author) {
    return -1;
  }

  if (a.author > b.author) {
    return 1;
  }

  // And if THOSE match, compare timestamp.

  if (a.timestamp < b.timestamp) {
    return -1;
  }

  if (a.timestamp > b.timestamp) {
    return 1;
  }

  return 0;
}
