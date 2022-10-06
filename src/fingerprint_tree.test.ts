import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { testMonoid } from "./monoid.ts";
import { FingerprintTree } from "./fingerprint_tree.ts";

type RangeVector = [[string, string], string];

const rangeVectors: RangeVector[] = [
  [["a", "a"], "abcdefg"],
  [["a", "d"], "abc"],
  [["c", "a"], "cdefg"],
  [["c", "g"], "cdef"],
  [["e", "a"], "efg"],
  [["b", "b"], "abcdefg"],
  [["c", "b"], "acdefg"],
  [["e", "b"], "aefg"],
  [["m", "d"], "abc"],
  [["m", "z"], "0"],
  [["f", "z"], "fg"],
];

type SeriesVector = [string[], string[]];

const seriesVectors: SeriesVector[] = [
  [["a", "a"], ["abcdefg"]],

  [["a", "d", "a"], ["abc", "defg"]],

  [["a", "d", "e"], ["abc", "d"]],

  [["a", "c", "e", "a"], ["ab", "cd", "efg"]],

  [["b", "e", "b"], ["bcd", "aefg"]],

  [["b", "d", "f", "b"], ["bc", "de", "afg"]],

  [["b", "b"], ["abcdefg"]],
];

Deno.test("FingerprintTree", () => {
  const tree = new FingerprintTree(
    testMonoid,
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

  for (const vector of rangeVectors) {
    assertEquals(
      tree.getFingerprint(vector[0][0], vector[0][1]),
      vector[1],
    );
  }

  for (const vector of seriesVectors) {
    assertEquals(tree.getFingerPrints(vector[0]), vector[1]);
  }
});
