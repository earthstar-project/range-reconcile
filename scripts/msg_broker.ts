import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../src/fingerprint_tree.ts";
import { xxHash32XorMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { uint8TestConfig } from "../src/message_broker_config.ts";
import { sync } from "../src/util.ts";

//const logMsgRounds = false;

function makeSet(size: number): number[] {
  const set = new Set<number>();

  for (let i = 0; i < size; i++) {
    const int = Math.floor(Math.random() * ((size * 2) - 1 + 1) + 1);

    set.add(int);
  }

  return Array.from(set);
}

const size = 100000;

// Set up peer

console.log("Generating sets...");

const setA = makeSet(size);
const setB = makeSet(size);

const treeA = new FingerprintTree(xxHash32XorMonoid);

console.log("Inserting into tree a...");

const encoder = new TextEncoder();

for (const item of setA) {
  treeA.insert(encoder.encode(`${item}`));
}

console.log("Inserting into tree b...");

// Other peer

const treeB = new FingerprintTree(xxHash32XorMonoid);

for (const item of setB) {
  treeB.insert(encoder.encode(`${item}`));
}

/*
const aLog: string[] = [];
const bLog: string[] = [];

const aLogs: string[][] = [];
const bLogs: string[][] = [];

const printerA = new TransformStream<string>({
  transform(message, controller) {
    aLog.push(message);

    if (message.includes("TERMINAL")) {
      aLogs.push(aLog.splice(0, aLog.length));

      if (logMsgRounds) {
        console.group("%c A", "color: red");

        const logs = aLogs[aLogs.length - 1];

        for (const log of logs) {
          console.log(`%c ${log}`, "color: red");
        }

        console.groupEnd();
      }
    }

    controller.enqueue(message);
  },
});

const printerB = new TransformStream<string>({
  transform(message, controller) {
    bLog.push(message);

    if (message.includes("TERMINAL")) {
      bLogs.push(bLog.splice(0, bLog.length));

      if (logMsgRounds) {
        console.group("%c B", "color: blue");

        const logs = bLogs[bLogs.length - 1];

        for (const log of logs) {
          console.log(`%c ${log}`, "color: blue");
        }

        console.groupEnd();
      }
    }

    controller.enqueue(message);
  },
});

/*
console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();
*/

console.log("Syncing...");

const brokerA = new MessageBroker(
  treeA,
  uint8TestConfig,
);

const brokerB = new MessageBroker(
  treeB,
  uint8TestConfig,
);

await sync(brokerA, brokerB);

/*
console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();
*/

assertEquals(Array.from(treeA.lnrValues()), Array.from(treeB.lnrValues()));

console.log("Done");
