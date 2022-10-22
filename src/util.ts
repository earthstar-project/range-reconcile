import { RangeMessenger } from "./range_messenger/range_messenger.ts";
import { Deferred } from "https://deno.land/std@0.158.0/async/deferred.ts";

/** Execute a complete exchange between two RangeMessengers, syncing their trees. */
export async function sync<E, V, L>(
  from: RangeMessenger<E, V, L>,
  to: RangeMessenger<E, V, L>,
  messages?: AsyncIterable<E> | Iterable<E>,
  isDone?: Deferred<unknown>,
): Promise<void> {
  const msgs: E[] = [];

  const messagesToProcess = messages || from.initialEvents();

  for await (
    const msg of messagesToProcess
  ) {
    const responses = to.respond(msg);
    msgs.push(...responses);
  }

  if (isDone?.state === "fulfilled") {
    return Promise.resolve();
  } else {
    await sync(to, from, msgs, to.isDone());
  }
}
