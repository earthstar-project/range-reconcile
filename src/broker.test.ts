import { Broker } from "./broker.ts";
import { FingerprintTree } from "./fingerprint_tree.ts";
import { testMonoid } from "./monoid.ts";

Deno.test("Broker", () => {
  const tree = new FingerprintTree(testMonoid);
  const broker = new Broker(tree, {
    decodeValue: (v) => v,
    decodeRangeItem: (item) => item,
  });

  broker.respond("a test b test2 c test3 d");
});
