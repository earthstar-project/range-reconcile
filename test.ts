import { combineMonoid, sizeMonoid, testMonoid, xorMonoid } from "./monoid.ts";
import { AugmentedTree } from "./tree.ts";
import { RangeSeries } from "./types.ts";

const tree = new AugmentedTree(
  testMonoid,
  (a: string, b: string) => {
    if (a > b) {
      return 1;
    } else if (b > a) {
      return -1;
    }

    return 0;
  },
  (v: string) => v + 1,
);

const set = ["a", "b", "c", "d", "e", "f", "g"];

for (const item of set) {
  tree.insert(item);
}

const ranges: RangeSeries<string> = ["b", ["d", "f"], "b"];

const fingerprints = tree.getFingerPrints(ranges);

console.log("Set", set);

console.log("Range series", ranges);
console.log("Expected fingerprints", ["bc", "de", "fga"]);

console.log("Fingerprints", fingerprints);

// x0
//    (bee cat doe eel fox hog)
// x1
//    (ape eel fox gnu)

//                 <-- (ape, ape, apeeelfoxgnu)
//                      "apeelfoxgnu"

// x0 computes fp(bee, bee) = beecatdoeeelfoxhog
// doesn't match. Splits set into two equal halves.
// (ape, eel) (fox, hog)

// (ape eel beecatdoe) -->
// (eel ape eelfoxhog) -->

// x1 computes fps for boths
//                          fp(ape, eel) = ape
//                          this only has one item, so ape is transmitted!
//                          <--- <ape eel ape>
//                          fp(eel, ape) = eelfoxgnu
//                          this has many items (eelfoxgnu), so we split
//                                first half has many items, so send fp
//                          <--- (eel gnu eelfox)
//                                second half has only one, so send item
//                          <--- <gnu ape gnu>

// x0 got <ape eel ape> and <gnu ape gnu>
// <ape eel beecatdoe> -->
// <gnu ape hog> -->
// for the range fp (eel gnu eelfox) = eelfox
// fp is same so considered reconciled

// so how can we turn this into an efficient message scheme for earthstar?
