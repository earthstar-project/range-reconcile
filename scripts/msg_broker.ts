import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { testMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { testConfig } from "../src/message_broker_config.ts";

// Set up peer

const treeA = new FingerprintTree(testMonoid);

const setA = ["bee", "cat", "doe", "eel", "fox", "hog"];

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

const setB = ["ape", "eel", "fox", "gnu"];

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

brokerB.readable.pipeThrough(printerB).pipeTo(brokerA.writable);
brokerA.readable.pipeThrough(printerA).pipeTo(brokerB.writable);

await Promise.all([brokerA.isDone(), brokerB.isDone()]);

console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();
