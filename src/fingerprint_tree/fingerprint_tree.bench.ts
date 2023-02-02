import { RedBlackTree } from "https://deno.land/std@0.158.0/collections/red_black_tree.ts";
import { FingerprintTree } from "./fingerprint_tree.ts";
import { concatMonoid } from "../lifting_monoid.ts";

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

type BenchVector = [
  number,
  { fstqrt: string; mid: string; thdqrt: string },
];

const vectors: BenchVector[] = [
  [10, { fstqrt: "2", mid: "5", thdqrt: "7" }],
  [100, { fstqrt: "25", mid: "50", thdqrt: "75" }],
  [1000, { fstqrt: "250", mid: "500", thdqrt: "750" }],
  [10000, { fstqrt: "2500", mid: "5000", thdqrt: "7500" }],
];

for (const vec of vectors) {
  const size = vec[0];
  const boundaries = vec[1];

  const set = makeSet(size);

  const tree = new FingerprintTree(concatMonoid, (a, b) => {
    if (a > b) {
      return 1;
    } else if (a < b) {
      return -1;
    } else {
      return 0;
    }
  });

  const rbTree = new RedBlackTree();

  Deno.bench(`Insert into RedBlackTree (${size} items)`, {
    group: `insert (${vec})`,
    baseline: true,
  }, () => {
    for (const element of set) {
      rbTree.insert(element);
    }
  });

  Deno.bench(`Insert into FingerPrintTree (${size} items)`, {
    group: `insert (${vec})`,
  }, () => {
    for (const element of set) {
      tree.insert(`${element}`);
    }
  });

  Deno.bench(`Fingerprint min - min (${size} items) `, {
    group: `fingerprint (${vec})`,
    baseline: true,
  }, () => {
    const min = tree.getLowestValue();

    tree.getFingerprint(min, min);
  });

  Deno.bench(`Fingerprint mid - mid (${size} items) `, {
    group: `fingerprint (${vec})`,
  }, () => {
    tree.getFingerprint(boundaries.mid, boundaries.mid);
  });

  Deno.bench(`Fingerprint min - mid (${size} items) `, {
    group: `fingerprint (${vec})`,
  }, () => {
    const min = tree.getLowestValue();
    tree.getFingerprint(min, boundaries.mid);
  });

  Deno.bench(`Fingerprint mid - min (${size} items) `, {
    group: `fingerprint (${vec})`,
  }, () => {
    const min = tree.getLowestValue();
    tree.getFingerprint(boundaries.mid, min);
  });

  Deno.bench(`Fingerprint fstqrt - thdqrt (${size} items) `, {
    group: `fingerprint (${vec})`,
  }, () => {
    tree.getFingerprint(boundaries.fstqrt, boundaries.thdqrt);
  });

  Deno.bench(`Fingerprint thrqrt - fstqrt (${size} items) `, {
    group: `fingerprint (${vec})`,
  }, () => {
    tree.getFingerprint(boundaries.thdqrt, boundaries.fstqrt);
  });
}
