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

function compare<T>(a: T, b: T) {
  if (a > b) {
    return 1;
  } else if (a < b) {
    return -1;
  } else {
    return 0;
  }
}

for (const size of sizes) {
  const setA = makeSet(size);
  const setB = makeSet(size);

  Deno.bench(`Instantiate two sets (size ${size})`, () => {
    const treeA = new FingerprintTree(concatMonoid, compare, "" as string);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(concatMonoid, compare, "" as string);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }
  });

  Deno.bench(`Instantiate and sync two sets (size ${size})`, async () => {
    const treeA = new FingerprintTree(concatMonoid, compare, "" as string);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(concatMonoid, compare, "" as string);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }

    const messengerA = new RangeMessenger(
      {
        tree: treeA,
        fingerprintEquals: nativeEquals,
        encoding: objConfig,
        payloadThreshold: 1,
        rangeDivision: 2,
      },
    );
    const messengerB = new RangeMessenger(
      {
        tree: treeB,
        fingerprintEquals: nativeEquals,
        encoding: objConfig,
        payloadThreshold: 1,
        rangeDivision: 2,
      },
    );

    await sync(messengerA, messengerB);
  });
}
