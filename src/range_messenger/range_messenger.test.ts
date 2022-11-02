import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../fingerprint_tree/fingerprint_tree.ts";
import { concatMonoid } from "../lifting_monoid.ts";
import { RangeMessenger } from "./range_messenger.ts";
import { objConfig } from "./range_messenger_config.ts";
import { sync } from "../util.ts";

function multiplyElements(elements: string[], by: number): string[] {
  const acc = [];

  for (const element of elements) {
    acc.push(element);

    for (let i = 2; i <= by; i++) {
      acc.push(element + i);
    }
  }

  return acc;
}

const elements = ["ape", "bee", "cat", "doe", "eel", "fox", "gnu", "hog"];

function createTestSet() {
  const baseCount = Math.floor(Math.random() * 8);

  const acc: string[] = [];
  const remaining = elements.slice();

  if (baseCount > 0) {
    for (let i = 0; i <= baseCount; i++) {
      const index = Math.floor(
        Math.random() * remaining.length,
      );

      acc.push(...remaining.splice(index, 1));
    }
  }

  return multiplyElements(acc, Math.floor(Math.random() * 4) + 1);
}

async function createTestCase() {
  const treeA = new FingerprintTree(concatMonoid);

  const setA = createTestSet();

  for (const item of setA) {
    treeA.insert(item);
  }

  const brokerA = new RangeMessenger(treeA, objConfig);

  // Other peer

  const treeB = new FingerprintTree(concatMonoid);

  const setB = createTestSet();

  for (const item of setB) {
    treeB.insert(item);
  }

  const brokerB = new RangeMessenger(treeB, objConfig);

  await sync(brokerA, brokerB);

  return {
    setA: Array.from(treeA.lnrValues()),
    setB: Array.from(treeB.lnrValues()),
    ogA: setA,
    ogB: setB,
  };
}

Deno.test("Message broker (fuzz)", async () => {
  for (let i = 0; i < 1000; i++) {
    const { setA, setB, ogA, ogB } = await createTestCase();

    try {
      assertEquals(setA, setB);
    } catch {
      if (debugLog) {
        console.log("Set A:", ogA);
        console.log("Set B:", ogB);
      }
    }

    assertEquals(setA, setB);
  }
});

const debugLog = true;
