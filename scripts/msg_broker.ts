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

const setA = [
  "eel",
  "bee",
  "fox",
  "hog",
  "cat",
  "ape",
  "gnu",
];

for (const item of setA) {
  treeA.insert(item);
}

const brokerA = new MessageBroker(treeA, testConfig, false);

// Other peer

const treeB = new FingerprintTree(testMonoid);

const setB = ["doe", "doe2", "fox", "fox2"];

for (const item of setB) {
  treeB.insert(item);
}

const brokerB = new MessageBroker(treeB, testConfig, true);

const aLog: string[] = [];
const bLog: string[] = [];

const aLogs: string[][] = [];
const bLogs: string[][] = [];

const printerA = new TransformStream<string>({
  transform(message, controller) {
    aLog.push(message);

    if (message.includes("TERMINAL")) {
      aLogs.push(aLog.splice(0, aLog.length));

      console.group("%c A", "color: red");

      const logs = aLogs[aLogs.length - 1];

      for (const log of logs) {
        console.log(`%c ${log}`, "color: red");
      }

      console.groupEnd();
    }

    controller.enqueue(message);
  },
});

const printerB = new TransformStream<string>({
  transform(message, controller) {
    bLog.push(message);

    if (message.includes("TERMINAL")) {
      bLogs.push(bLog.splice(0, bLog.length));

      console.group("%c B", "color: blue");

      const logs = bLogs[bLogs.length - 1];

      for (const log of logs) {
        console.log(`%c ${log}`, "color: blue");
      }

      console.groupEnd();
    }

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
