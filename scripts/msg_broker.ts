import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { testMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { testConfig } from "../src/message_broker_config.ts";

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

// Set up peer

const treeA = new FingerprintTree(testMonoid);

const setA = ["ape", "doe", "fox"];

for (const item of setA) {
  treeA.insert(item);
}

const brokerA = new MessageBroker(treeA, testConfig, false);

const printerA = new TransformStream<string>({
  transform(message, controller) {
    console.group("%c A →", "color: red");
    console.log(`%c ${message}`, "color: red");
    console.groupEnd();

    controller.enqueue(message);
  },
});

// Other peer

const treeB = new FingerprintTree(testMonoid);

const setB = ["bee", "hog"];

for (const item of setB) {
  treeB.insert(item);
}

const brokerB = new MessageBroker(treeB, testConfig, true);

const printerB = new TransformStream<string>({
  transform(message, controller) {
    console.group("%c B →", "color: blue");
    console.log(`%c ${message}`, "color: blue");
    console.groupEnd();

    controller.enqueue(message);
  },
});

console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();

brokerB.readable
  .pipeThrough(printerB)
  .pipeThrough(brokerA)
  .pipeThrough(printerA)
  .pipeTo(brokerB.writable);

await Promise.all([brokerA.isDone(), brokerB.isDone()]);

console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();

assertEquals(Array.from(treeA.lnrValues()), Array.from(treeB.lnrValues()));
