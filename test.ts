import { scenario1 } from "./sample_sets.ts";
import { AugmentedTree } from "./tree.ts";
import { RangeSeries } from "./types.ts";
import { encodeDocThumbnail } from "./util.ts";

const items = scenario1.a;
const encoded = items.map(encodeDocThumbnail);
const tree = new AugmentedTree({
  lift: (a: string) => a,
  combine: (a: string, b: string) => {
    const fst = a === "0" ? "" : a;
    const snd = b === "0" ? "" : b;

    return fst + snd;
  },
  neutral: "0",
  oneBigger: (val: string) => val + 1,
}, (a: string, b: string) => {
  if (a > b) {
    return 1;
  } else if (b > a) {
    return -1;
  }

  return 0;
});

for (const item of encoded) {
  tree.insert(item);
}

const ranges: RangeSeries<string> = [null, ["/b", "/d"], null];

const fingerprints = tree.getFingerPrints(ranges);

console.log(ranges);

console.log(fingerprints);
