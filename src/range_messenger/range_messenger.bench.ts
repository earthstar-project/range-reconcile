import { FingerprintTree } from "../fingerprint_tree/fingerprint_tree.ts";
import { concatMonoid } from "../lifting_monoid.ts";
import { RangeMessenger } from "./range_messenger.ts";
import { objConfig } from "./range_messenger_config.ts";
import { sync } from "../util.ts";

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

const sizes = [10, 100, 1000, 2500, 5000, 10000];

function nativeEquals(a: string, b: string) {
  return a === b;
}

for (const size of sizes) {
  const setA = makeSet(size);
  const setB = makeSet(size);

  Deno.bench(`Instantiate two sets (size ${size})`, () => {
    const treeA = new FingerprintTree(concatMonoid);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(concatMonoid);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }
  });

  Deno.bench(`Instantiate and sync two sets (size ${size})`, async () => {
    const treeA = new FingerprintTree(concatMonoid);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(concatMonoid);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }

    const messengerA = new RangeMessenger(
      treeA,
      nativeEquals,
      objConfig,
    );
    const messengerB = new RangeMessenger(
      treeB,
      nativeEquals,
      objConfig,
    );

    await sync(messengerA, messengerB);
  });
}
