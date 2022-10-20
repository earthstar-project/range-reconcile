import { MessageBroker } from "./message_broker.ts";
import Queue from "https://deno.land/x/queue/mod.ts";

export function sync2<E, V, L>(
  a: MessageBroker<E, V, L>,
  b: MessageBroker<E, V, L>,
  logMsgRounds = false,
) {
  const aThing = new Thing("a", a);
  const bThing = new Thing("b", b, true);

  const aLog: string[] = [];
  const bLog: string[] = [];

  const aLogs: string[][] = [];
  const bLogs: string[][] = [];

  const printerA = new TransformStream<E>({
    transform(message, controller) {
      aLog.push(message as string);

      //console.log("a", message);

      if ((message as string).includes("TERMINAL")) {
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

  const printerB = new TransformStream<E>({
    transform(message, controller) {
      bLog.push(message as string);

      //console.log("b", message);

      if ((message as string).includes("TERMINAL")) {
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

  bThing.transformer.readable
    .pipeThrough(printerB)
    .pipeThrough(aThing.transformer)
    .pipeThrough(printerA)
    .pipeTo(bThing.transformer.writable);

  return Promise.all([a.isDone(), b.isDone()]);
}

class Thing<E, V, L> {
  transformer: TransformStream<E, E>;
  id: string;

  constructor(id: string, broker: MessageBroker<E, V, L>, initiate = false) {
    this.id = id;
    this.transformer = new TransformStream<E, E>({
      transform(message, controller) {
        const replies = broker.respond(message);

        for (const reply of replies) {
          controller.enqueue(reply);
        }
      },
      start(controller) {
        if (initiate) {
          for (const msg of broker.initialEvents()) {
            controller.enqueue(msg);
          }
        }
      },
    }, new CountQueuingStrategy({ highWaterMark: 10000000 }));
  }
}

// Sync 3

export function sync3<E, V, L>(
  a: MessageBroker<E, V, L>,
  b: MessageBroker<E, V, L>,
) {
  const msgsForA = new Queue();
  const msgsForB = new Queue();

  const initialMessages = a.initialEvents();

  let aIsDone = false;
  let bIsDone = false;

  a.isDone().then(() => {
    aIsDone = true;
  });
  b.isDone().then(() => {
    bIsDone = true;
  });

  const queue = (broker: "a" | "b", msg: E) => {
    const queueToUse = broker === "a" ? msgsForA : msgsForB;
    const brokerToUse = broker === "a" ? a : b;
    const isDoneToUse = broker === "a" ? aIsDone : bIsDone;

    queueToUse.push(() => {
      const responses = brokerToUse.respond(msg);

      if (isDoneToUse) {
        return;
      }

      for (const response of responses) {
        queue(broker === "a" ? "b" : "a", response);
      }
    });
  };

  for (const msg of initialMessages) {
    queue("b", msg);
  }

  return Promise.all([a.isDone(), b.isDone()]);
}
//
