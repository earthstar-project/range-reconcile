import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { testMonoid, xxHash32XorMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { testConfig, uint8TestConfig } from "../src/message_broker_config.ts";
import { sync3 } from "./util.ts";

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

const sizes = [10, 100, 1000, 10000];

for (const size of sizes) {
  const setA = makeSet(size);
  const setB = makeSet(size);

  Deno.bench(`Instantiate two sets (size ${size})`, () => {
    const treeA = new FingerprintTree(testMonoid);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(testMonoid);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }
  });

  Deno.bench(`Instantiate and sync two sets (size ${size})`, async () => {
    const treeA = new FingerprintTree(testMonoid);

    for (const item of setA) {
      treeA.insert(`${item}`);
    }

    const treeB = new FingerprintTree(testMonoid);

    for (const item of setB) {
      treeB.insert(`${item}`);
    }

    const brokerA = new MessageBroker(
      treeA,
      testConfig,
    );
    const brokerB = new MessageBroker(
      treeB,
      testConfig,
    );

    await sync3(brokerA, brokerB);

    // assertEquals(Array.from(treeA.lnrValues()), Array.from(treeB.lnrValues()));
  });
}
