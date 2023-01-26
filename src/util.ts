import { RangeMessenger } from "./range_messenger/range_messenger.ts";
import { AsyncQueue } from "https://deno.land/x/for_awaitable_queue@1.0.0/mod.ts";

/** Execute a complete exchange between two RangeMessengers, syncing their trees. */
export function reconcile<E, V, L>(
  a: RangeMessenger<E, V, L>,
  b: RangeMessenger<E, V, L>,
): Promise<unknown[]> {
  const queueA = new AsyncQueue<E>();
  const queueB = new AsyncQueue<E>();

  queueB.push(...a.initialMessages());

  (async () => {
    for await (const msg of queueB) {
      //   console.log("B got", msg);

      const responses = b.respond(msg);

      //  await sleep();

      for (const res of responses) {
        queueA.push(res);
      }
    }
  })();

  (async () => {
    for await (const msg of queueA) {
      //  console.log("A got", msg);

      const responses = a.respond(msg);

      // await sleep();

      for (const res of responses) {
        queueB.push(res);
      }
    }
  })();

  a.isDone().then(() => queueA.close());
  b.isDone().then(() => queueB.close());

  return Promise.all([a.isDone(), b.isDone()]);
}
