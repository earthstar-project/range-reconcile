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

const sizes = [1, 10, 100, 1000, 10000];

for (const size of sizes) {
  const set = makeSet(size);

  const tree = new FingerprintTree(concatMonoid, (a, b) => {
    if (a > b) {
      return 1;
    } else if (a < b) {
      return -1;
    } else {
      return 0;
    }
  }, "" as string);
  const rbTree = new RedBlackTree();

  Deno.bench(`Insert into RedBlackTree (${size} items)`, {
    group: `insert (${size})`,
    baseline: true,
  }, () => {
    for (const element of set) {
      rbTree.insert(element);
    }
  });

  Deno.bench(`Insert into FingerPrintTree (${size} items)`, {
    group: `insert (${size})`,
  }, () => {
    for (const element of set) {
      tree.insert(`${element}`);
    }
  });

  const min = `${Math.min(...set)}`;
  const mid = `${Math.floor(Math.max(...set) / 2)}`;

  Deno.bench(`Fingerprint min - min (${size} items) `, {
    group: `fingerprint (${size})`,
    baseline: true,
  }, () => {
    tree.getFingerprint(min, min);
  });

  Deno.bench(`Fingerprint min - mid (${size} items) `, {
    group: `fingerprint (${size})`,
  }, () => {
    tree.getFingerprint(min, mid);
  });

  Deno.bench(`Fingerprint mid - mid (${size} items) `, {
    group: `fingerprint (${size})`,
  }, () => {
    tree.getFingerprint(mid, mid);
  });

  Deno.bench(`Fingerprint mid - min (${size} items) `, {
    group: `fingerprint (${size})`,
  }, () => {
    tree.getFingerprint(mid, min);
  });
}
