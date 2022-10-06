import { xxHash32 } from "https://raw.githubusercontent.com/gnlow/deno-xxhash/master/mod.ts";

export type Monoid<ValueType, LiftType, NeutralType> = {
  lift: (i: ValueType) => LiftType;
  combine: (
    a: LiftType | NeutralType,
    b: LiftType | NeutralType,
  ) => LiftType | NeutralType;
  neutral: NeutralType;
};

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

export const sizeMonoid: Monoid<unknown, number, 0> = {
  lift: (_a: unknown) => 1,
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
};
