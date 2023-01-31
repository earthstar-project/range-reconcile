import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "./fingerprint_tree/fingerprint_tree.ts";
import { concatMonoid } from "./lifting_monoid.ts";
import { RangeMessenger } from "./range_messenger/range_messenger.ts";
import { objConfig } from "./range_messenger/range_messenger_config.ts";
import { reconcile } from "./util.ts";

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

Deno.test({
  name: "reconcile",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const treeA = new FingerprintTree(concatMonoid, compare);

    const setA = ["ape", "cat", "eel", "fox"];

    for (const item of setA) {
      treeA.insert(item);
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

    const setB = ["bee", "doe", "eel", "gnu"];

    for (const item of setB) {
      treeB.insert(item);
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
  },
});
