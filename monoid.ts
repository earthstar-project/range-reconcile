import { xxHash32 } from "https://raw.githubusercontent.com/gnlow/deno-xxhash/master/mod.ts";
import { Monoid } from "./types.ts";

export function combineMonoid<V, AL, AN, BL, BN>(
  a: Monoid<V, AL, AN>,
  b: Monoid<V, BL, BN>,
): Monoid<V, [AL, BL], [AN, BN]> {
  return {
    lift: (i) => {
      return [a.lift(i), b.lift(i)];
    },
    combine: (ia, ib) => {
      const fst = a.combine(ia[0], ib[0]);
      const snd = b.combine(ia[1], ib[1]);

      return [fst, snd] as [AL, BL] | [AN, BN];
    },
    neutral: [a.neutral, b.neutral],
  };
}

//

export const testMonoid = {
  lift: (a: string) => a,
  combine: (a: string, b: string) => {
    const fst = a === "0" ? "" : a;
    const snd = b === "0" ? "" : b;

    return fst + snd;
  },
  neutral: "0",
};

export const sizeMonoid: Monoid<any, number, 0> = {
  lift: (a: any) => 1,
  combine: (a: number, b: number) => a + b,
  neutral: 0,
};

export const xorMonoid = {
  lift: (v: string) => {
    const hash = xxHash32(v).toString(16);
    return new TextEncoder().encode(hash);
  },
  combine: (a: Uint8Array, b: Uint8Array) => {
    const res = new Uint8Array(a);

    for (let i = 0; i < a.length; i++) {
      Atomics.xor(res, i, b[i]);
    }

    return res;
  },
  neutral: new Uint8Array(8),
  oneBigger: (v: string) => v + 1,
};