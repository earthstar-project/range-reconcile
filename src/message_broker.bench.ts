import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { testMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { testConfig } from "../src/message_broker_config.ts";

// Set up peer

const setA = ["bee ", "cat", "doe", "eel", "fox", "hog"];

const setB = ["ape", "eel", "fox", "gnu"];

Deno.bench("Instantiate two sets (size 6, 4)", () => {
  const treeA = new FingerprintTree(testMonoid);

  for (const item of setA) {
    treeA.insert(item);
  }

  const treeB = new FingerprintTree(testMonoid);

  for (const item of setB) {
    treeB.insert(item);
  }
});

Deno.bench("Instantiate and sync two sets (size 6, 4)", async () => {
  const treeA = new FingerprintTree(testMonoid);

  for (const item of setA) {
    treeA.insert(item);
  }

  const brokerA = new MessageBroker(treeA, testConfig, false);

  // Other peer

  const treeB = new FingerprintTree(testMonoid);

  for (const item of setB) {
    treeB.insert(item);
  }

  const brokerB = new MessageBroker(treeB, testConfig, true);

  brokerB.readable.pipeThrough(brokerA).pipeTo(brokerB.writable);

  await Promise.all([brokerA.isDone(), brokerB.isDone()]);
});

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

const a500 = multiplyElements(setA, 100);
const b500 = multiplyElements(setB, 100);

Deno.bench("Instantiate two sets (size 600, 400)", () => {
  const treeA = new FingerprintTree(testMonoid);

  for (const item of a500) {
    treeA.insert(item);
  }

  const treeB = new FingerprintTree(testMonoid);

  for (const item of b500) {
    treeB.insert(item);
  }
});

Deno.bench("Instantiate and sync two sets (size 6000, 4000)", async () => {
  const treeA = new FingerprintTree(testMonoid);

  for (const item of a500) {
    treeA.insert(item);
  }

  const brokerA = new MessageBroker(treeA, testConfig, false);

  // Other peer

  const treeB = new FingerprintTree(testMonoid);

  for (const item of b500) {
    treeB.insert(item);
  }

  const brokerB = new MessageBroker(treeB, testConfig, true);

  brokerB.readable.pipeThrough(brokerA).pipeThrough(
    new TransformStream({}, new CountQueuingStrategy({ highWaterMark: 1000 })),
  ).pipeTo(brokerB.writable);

  await Promise.all([brokerA.isDone(), brokerB.isDone()]);
});
