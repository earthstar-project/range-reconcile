import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { concatMonoid } from "../lifting_monoid.ts";
import { FingerprintTree } from "./fingerprint_tree.ts";

// The range, the fingerprint, size, collected items.
type RangeVector = [[string, string], string, number, string[]];

const rangeVectors: RangeVector[] = [
  [["a", "a"], "abcdefg", 7, ["a", "b", "c", "d", "e", "f", "g"]],
  [["a", "d"], "abc", 3, ["a", "b", "c"]],
  [["g", "a"], "g", 1, ["g"]],
  [["c", "a"], "cdefg", 5, ["c", "d", "e", "f", "g"]],
  [["c", "g"], "cdef", 4, ["c", "d", "e", "f"]],
  [["e", "a"], "efg", 3, ["e", "f", "g"]],
  [["b", "b"], "abcdefg", 7, ["a", "b", "c", "d", "e", "f", "g"]],
  [["c", "b"], "acdefg", 6, ["a", "c", "d", "e", "f", "g"]],
  [["e", "b"], "aefg", 4, ["a", "e", "f", "g"]],
  [["m", "d"], "abc", 3, ["a", "b", "c"]],
  [["m", "z"], "0", 0, []],
  [["f", "z"], "fg", 2, ["f", "g"]],
];

Deno.test("FingerprintTree", () => {
  const tree = new FingerprintTree(
    concatMonoid,
    (a, b) => {
      if (a > b) {
        return 1;
      } else if (a < b) {
        return -1;
      } else {
        return 0;
      }
    },
    "" as string,
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
    const result = tree.getFingerprint(vector[0][0], vector[0][1]);

    assertEquals(
      result.fingerprint,
      vector[1],
    );

    assertEquals(
      result.size,
      vector[2],
    );

    assertEquals(
      result.items,
      vector[3],
    );
  }
});
