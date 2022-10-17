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

const elements = ["ape", "bee", "cat", "doe", "eel", "fox", "gnu", "hog"];

function createTestSet() {
  const baseCount = Math.floor(Math.random() * 8) + 1;

  const acc: string[] = [];
  const remaining = elements.slice();

  for (let i = 0; i <= baseCount; i++) {
    const index = Math.floor(
      Math.random() * remaining.length,
    );

    acc.push(...remaining.splice(index, 1));
  }

  return multiplyElements(acc, Math.floor(Math.random() * 2) + 1);
}

async function createTestCase() {
  const treeA = new FingerprintTree(testMonoid);

  const setA = createTestSet();

  for (const item of setA) {
    treeA.insert(item);
  }

  const brokerA = new MessageBroker(treeA, testConfig, false);

  // Other peer

  const treeB = new FingerprintTree(testMonoid);

  const setB = createTestSet();

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
      if (debugLive) {
        console.log("A", message);
      }

      aLog.push(message);

      if (message.includes("TERMINAL")) {
        aLogs.push(aLog.splice(0, aLog.length));
      }

      controller.enqueue(message);
    },
  });

  const printerB = new TransformStream<string>({
    transform(message, controller) {
      if (debugLive) {
        console.log("B", message);
      }

      bLog.push(message);

      if (message.includes("TERMINAL")) {
        bLogs.push(bLog.splice(0, bLog.length));
      }

      controller.enqueue(message);
    },
  });

  brokerB.readable
    .pipeThrough(printerB)
    .pipeThrough(brokerA)
    .pipeThrough(printerA)
    .pipeTo(brokerB.writable);

  await Promise.all([brokerA.isDone(), brokerB.isDone()]);

  const log: string[][] = [];

  for (let i = 0; i < Math.max(aLogs.length, bLogs.length); i++) {
    log.push(bLogs[i]);
    log.push(aLogs[i]);
  }

  return {
    log,
    setA: Array.from(treeA.lnrValues()),
    setB: Array.from(treeB.lnrValues()),
    ogA: setA,
    ogB: setB,
  };
}

Deno.test("Fuzz message broker", async (test) => {
  for (let i = 0; i < 100; i++) {
    await test.step(`Iteration ${i}`, async () => {
      const { log, setA, setB, ogA, ogB } = await createTestCase();

      try {
        assertEquals(setA, setB);
      } catch {
        if (debugLog) {
          console.log("Set A:", ogA);
          console.log("Set B:", ogB);

          for (let i = 0; i < log.length; i++) {
            console.group(i % 2 === 0 ? "B" : "A");
            for (const msg of log[i]) {
              console.log(msg);
            }
            console.groupEnd();
          }
        }
      }

      assertEquals(setA, setB);
    });
  }
});

const debugLog = true;
const debugLive = false;
