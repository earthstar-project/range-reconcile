import { FingerprintTree } from "./fingerprint_tree.ts";
import { testMonoid, xorMonoid } from "./lifting_monoid.ts";

const alphaElements = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
];

function multiplyElements(elements: string[], by: number): string[] {
  const acc = [];

  for (const element of elements) {
    acc.push(element);

    for (let i = 2; i <= by; i++) {
      acc.push(element.repeat(i));
    }
  }

  return acc;
}

function makeTree(
  elements: string[],
): FingerprintTree<string, string> {
  const tree = new FingerprintTree(testMonoid);

  for (const element of elements) {
    tree.insert(element);
  }

  return tree;
}

const smallestTree = makeTree(alphaElements);

Deno.bench("Fingerprint a - a (26 elements)", () => {
  smallestTree.getFingerprint("a", "a");
});

Deno.bench("Fingerprint a - b (26 elements)", () => {
  smallestTree.getFingerprint("a", "b");
});

Deno.bench("Fingerprint a - l (26 elements)", () => {
  smallestTree.getFingerprint("a", "l");
});

Deno.bench("Fingerprint b - b (26 elements)", () => {
  smallestTree.getFingerprint("b", "b");
});

Deno.bench("Fingerprint b - c (26 elements)", () => {
  smallestTree.getFingerprint("b", "c");
});

Deno.bench("Fingerprint b - l (26 elements)", () => {
  smallestTree.getFingerprint("b", "l");
});

const bigTree = makeTree(multiplyElements(alphaElements, 500));

Deno.bench("Fingerprint a - a (13000 elements)", () => {
  bigTree.getFingerprint("a", "a");
});

Deno.bench("Fingerprint a - b (13000 elements)", () => {
  bigTree.getFingerprint("a", "b");
});

Deno.bench("Fingerprint a - l (13000 elements)", () => {
  bigTree.getFingerprint("a", "l");
});

Deno.bench("Fingerprint b - b (13000 elements)", () => {
  bigTree.getFingerprint("b", "b");
});

Deno.bench("Fingerprint b - c (13000 elements)", () => {
  bigTree.getFingerprint("b", "c");
});

Deno.bench("Fingerprint b - l (13000 elements)", () => {
  bigTree.getFingerprint("b", "l");
});
