import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { testMonoid } from "./monoid.ts";
import { FingerprintTree } from "./tree.ts";
import { RangeSeries } from "./types.ts";

type TestVector = [RangeSeries<string>, string[]];

const testVectors: TestVector[] = [
  // The whole set
  [["a", [], "a"], ["abcdefg"]],

  // Whole set with subranges
  [["a", ["d"], "a"], ["abc", "defg"]],

  // Part of set with subranges
  [["a", ["d"], "e"], ["abc", "d"]],

  // Whole set with even more subranges
  [["a", ["c", "e"], "a"], ["ab", "cd", "efg"]],

  // Set beginning and ending from offset
  [["b", ["e"], "b"], ["bcd", "efga"]],

  // // Set beginning and ending from offset... with subranges
  [["b", ["d", "f"], "b"], ["bc", "de", "fga"]],

  // Set from offset, no subranges
  [["b", [], "b"], ["bcdefga"]],
];

Deno.test("Tree", () => {
  const tree = new FingerprintTree(
    testMonoid,
    (a: string, b: string) => {
      if (a > b) {
        return 1;
      } else if (b > a) {
        return -1;
      }

      return 0;
    },
    (v: string) => v + 1,
  );

  const set = ["a", "b", "c", "d", "e", "f", "g"];

  for (const item of set) {
    tree.insert(item);
  }

  const treeContents = [];

  for (const item of tree.lnrValues()) {
    treeContents.push(item);
  }

  assertEquals(set, treeContents);

  for (const vector of testVectors) {
    assertEquals(tree.getFingerPrints(vector[0]), vector[1]);
  }
});
