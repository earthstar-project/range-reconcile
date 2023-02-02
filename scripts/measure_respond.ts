import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../src/fingerprint_tree/fingerprint_tree.ts";
import { concatMonoid } from "../src/lifting_monoid.ts";
import { RangeMessenger } from "../src/range_messenger/range_messenger.ts";
import { objConfig } from "../src/range_messenger/range_messenger_config.ts";
import { reconcile } from "../src/util.ts";

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

function compare<T>(a: T, b: T) {
  if (a > b) {
    return 1;
  } else if (a < b) {
    return -1;
  } else {
    return 0;
  }
}

function nativeEquals(a: string, b: string) {
  return a === b;
}

const setSize = 10000;

const treeA = new FingerprintTree(concatMonoid, compare);

const setA = makeSet(setSize);

for (const item of setA) {
  treeA.insert(`${item}`);
}

const brokerA = new RangeMessenger({
  tree: treeA,
  fingerprintEquals: nativeEquals,
  encoding: objConfig,
  payloadThreshold: 1,
  rangeDivision: 2,
});

// Other peer

const treeB = new FingerprintTree(concatMonoid, compare);

const setB = makeSet(setSize);

for (const item of setB) {
  treeB.insert(`${item}`);
}

const brokerB = new RangeMessenger({
  tree: treeB,
  fingerprintEquals: nativeEquals,
  encoding: objConfig,
  payloadThreshold: 1,
  rangeDivision: 2,
});

await reconcile(brokerA, brokerB);

assertEquals(treeA.lnrValues(), treeB.lnrValues());
