import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { FingerprintTree } from "../src/fingerprint_tree/fingerprint_tree.ts";
import { concatMonoid, xxHash32XorMonoid } from "../src/lifting_monoid.ts";
import { MessageBroker } from "../src/message_broker.ts";
import { testConfig, uint8TestConfig } from "../src/message_broker_config.ts";
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

//const setA = ["cat", "cat2", "gnu", "gnu2"];

//const setB = ["fox", "gnu"];

const setA = makeSet(size);
const setB = makeSet(size);

console.log(setA.length);
console.log(setB.length);

const treeA = new FingerprintTree(concatMonoid);

console.log("Inserting into tree a...");

for (const item of setA) {
  treeA.insert(`${item}`);
}

console.log("Inserting into tree b...");

// Other peer

const treeB = new FingerprintTree(concatMonoid);

for (const item of setB) {
  treeB.insert(`${item}`);
}

console.group("%c A has:", "color: red");
console.log(`%c ${Array.from(treeA.lnrValues())}`, "color: red");
console.groupEnd();

console.group("%c B has:", "color: blue");
console.log(`%c ${Array.from(treeB.lnrValues())}`, "color: blue");
console.groupEnd();

console.log("Syncing...");

const brokerA = new MessageBroker(
  treeA,
  testConfig,
);

const brokerB = new MessageBroker(
  treeB,
  testConfig,
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
