import { xxHash32 } from "https://raw.githubusercontent.com/gnlow/deno-xxhash/master/mod.ts";

const encoder = new TextEncoder();

export function hash(input: Uint8Array): Uint8Array {
  const hash = xxHash32(input).toString(16);

  return encoder.encode(hash);
}

export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error("Inputs should have the same length");
  }

  const res = new Uint8Array(a);

  for (let i = 0; i < a.length; i++) {
    Atomics.xor(res, i, b[i]);
  }

  return res;
}

export function makeLabel(v: Uint8Array, l: Uint8Array, r: Uint8Array) {
  return xor(v, xor(r, l));
}

export function labelToString(uint8: Uint8Array): string {
  const view = new DataView(uint8.buffer, 0);

  return view.getUint32(0, true).toString(16);
}
