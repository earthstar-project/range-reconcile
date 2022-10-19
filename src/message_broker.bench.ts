import { Deferred } from "https://deno.land/std@0.158.0/async/deferred.ts";
import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { xxHash32XorMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { uint8TestConfig } from "../src/message_broker_config.ts";
import { sync } from "./util.ts";

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

const sizes = [10, 100, 1000, 10000];

const encoder = new TextEncoder();

for (const size of sizes) {
  Deno.bench(`Instantiate two sets (size ${size})`, () => {
    const treeA = new FingerprintTree(xxHash32XorMonoid);

    for (const item of makeSet(size)) {
      treeA.insert(encoder.encode(`${item}`));
    }

    const treeB = new FingerprintTree(xxHash32XorMonoid);

    for (const item of makeSet(size)) {
      treeB.insert(encoder.encode(`${item}`));
    }
  });

  Deno.bench(`Instantiate and sync two sets (size ${size})`, async () => {
    const treeA = new FingerprintTree(xxHash32XorMonoid);

    for (const item of makeSet(size)) {
      treeA.insert(encoder.encode(`${item}`));
    }

    const treeB = new FingerprintTree(xxHash32XorMonoid);

    for (const item of makeSet(size)) {
      treeB.insert(encoder.encode(`${item}`));
    }

    const brokerA = new MessageBroker(
      treeB,
      uint8TestConfig,
    );
    const brokerB = new MessageBroker(
      treeB,
      uint8TestConfig,
    );

    await sync(brokerA, brokerB);
  });
}
