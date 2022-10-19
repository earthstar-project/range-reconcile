import { Deferred } from "https://deno.land/std@0.158.0/async/deferred.ts";
import { MessageBroker } from "./message_broker.ts";

export async function sync<E, V, L>(
  from: MessageBroker<E, V, L>,
  to: MessageBroker<E, V, L>,
  messages?: AsyncIterable<E> | Iterable<E>,
  isDone?: Deferred<unknown>,
): Promise<void> {
  const msgs: E[] = [];

  const messagesToProcess = messages || from.initialEvents();

  for await (
    const msg of to.process(
      messagesToProcess as unknown as AsyncIterable<E>,
    )
  ) {
    msgs.push(msg);
  }

  if (isDone?.state === "fulfilled") {
    return Promise.resolve();
  } else {
    await sync(to, from, msgs, to.isDone());
  }
}
