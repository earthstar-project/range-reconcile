import { RangeMessenger } from "./range_messenger/range_messenger.ts";

/** Execute a complete exchange between two RangeMessengers, syncing their trees. */

export function reconcile<E, V, L>(
  a: RangeMessenger<E, V, L>,
  b: RangeMessenger<E, V, L>,
): Promise<unknown[]> {
  const queueA = new FastFIFO<E>(128);
  const queueB = new FastFIFO<E>(128);

  for (const msg of a.initialMessages()) {
    queueB.push(msg);
  }

  (async () => {
    for await (const msg of queueB) {
      const responses = b.respond(msg);

      for (const msg of responses) {
        queueA.push(msg);
      }

      console.groupEnd();
    }
  })();

  (async () => {
    for await (const msg of queueA) {
      const responses = a.respond(msg);

      for (const msg of responses) {
        queueB.push(msg);
      }
    }
  })();

  a.isDone().then(() => queueA.close());
  b.isDone().then(() => queueB.close());

  return Promise.all([a.isDone(), b.isDone()]);
}

export const END = Symbol("Stream ended.");
export const ERROR = Symbol("Stream errored.");

export type Enqueueable<T> = T | Promise<T> | typeof END | typeof ERROR;

export type Resolver<T> = (value: T | PromiseLike<T>) => void;

export type EndOptions = { immediately?: boolean; withError?: Error };

// Adapted from https://github.com/mafintosh/fast-fifo to turn into AsyncIterable

class FixedFIFO<T> {
  buffer: Array<T | undefined>;
  private mask: number;
  private top = 0;
  private btm = 0;

  next: null | FixedFIFO<T> = null;

  constructor(hwm: number) {
    if (!(hwm > 0) || ((hwm - 1) & hwm) !== 0) {
      throw new Error("Max size for a FixedFIFO should be a power of two");
    }
    this.buffer = new Array(hwm);
    this.mask = hwm - 1;
    this.top = 0;
    this.btm = 0;
  }

  push(data: T) {
    if (this.buffer[this.top] !== undefined) return false;
    this.buffer[this.top] = data;
    this.top = (this.top + 1) & this.mask;
    return true;
  }

  shift() {
    const last = this.buffer[this.btm];
    if (last === undefined) return undefined;
    this.buffer[this.btm] = undefined;
    this.btm = (this.btm + 1) & this.mask;
    return last;
  }

  peek() {
    return this.buffer[this.btm];
  }

  isEmpty() {
    return this.buffer[this.btm] === undefined;
  }
}

export class FastFIFO<T> {
  private hwm: number;
  private head: FixedFIFO<Enqueueable<T>>;
  private tail: FixedFIFO<Enqueueable<T>>;
  private resolve: null | Resolver<Enqueueable<T>> = null;

  constructor(hwm: number) {
    this.hwm = hwm || 16;
    this.head = new FixedFIFO(this.hwm);
    this.tail = this.head;
  }

  push(val: Enqueueable<T>) {
    if (this.resolve) {
      this.resolve(val);
      this.resolve = null;
      return;
    }

    if (!this.head.push(val)) {
      const prev = this.head;
      this.head = prev.next = new FixedFIFO<Enqueueable<T>>(
        2 * this.head.buffer.length,
      );
      this.head.push(val);
    }
  }

  shift() {
    const val = this.tail.shift();
    if (val === undefined && this.tail.next) {
      const next = this.tail.next;
      this.tail.next = null;
      this.tail = next;
      return this.tail.shift();
    }
    return val;
  }

  peek() {
    return this.tail.peek();
  }

  isEmpty() {
    return this.head.isEmpty();
  }

  close() {
    this.push(END);
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const shifted = this.shift();

      const value = shifted ||
        await new Promise<Enqueueable<T>>((res) => {
          this.resolve = res;
        });

      if (value === END || value === ERROR) {
        break;
      }

      yield value;
    }
  }
}

/** Execute a complete exchange between two RangeMessengers, syncing their trees. */
/*
export async function reconcile<E, V, L>(
  a: RangeMessenger<E, V, L>,
  b: RangeMessenger<E, V, L>,
): Promise<unknown[]> {
  const queueA = new AsyncQueue<E>();
  const queueB = new AsyncQueue<E>();

  queueB.push(...a.initialMessages());

  (async () => {
    for await (const msg of queueB) {
      const responses = b.respond(msg);

      if (responses.length) {
        queueA.push(...responses);
      }
    }
  })();

  (async () => {
    for await (const msg of queueA) {
      const responses = a.respond(msg);

      if (responses.length) {
        queueB.push(...responses);
      }
    }
  })();

  a.isDone().then(() => queueA.close());
  b.isDone().then(() => queueB.close());

  return Promise.all([a.isDone(), b.isDone()]);
}
*/

/** Execute a complete exchange between two RangeMessengers, syncing their trees. */
/*
export async function reconcile<E, V, L>(
  from: RangeMessenger<E, V, L>,
  to: RangeMessenger<E, V, L>,
  round: number = 0,
  messages?: AsyncIterable<E> | Iterable<E>,
  isDone?: Deferred<unknown>,
): Promise<void> {
  const msgs: E[] = [];

  const messagesToProcess = messages || from.initialMessages();

  for await (
    const msg of messagesToProcess
  ) {
    const responses = to.respond(msg);
    msgs.push(...responses);
  }

  if (isDone?.state === "fulfilled") {
    return Promise.resolve();
  } else {
    await reconcile(to, from, round + 1, msgs, to.isDone());
  }
}
*/
