import { labelToString } from "./fingerprints_labels.ts";
import { scenario1 } from "./sample_sets.ts";
import { AugmentedTree } from "./tree.ts";
import { encodeDocThumbnail } from "./util.ts";

const items = scenario1.a;
const encoded = items.map(encodeDocThumbnail);
const tree = new AugmentedTree();

for (const item of encoded) {
  tree.insert(item);
}

for (const item of tree.lnrValueLabels()) {
  console.log(item);
}

/*
tree.remove("/c @gema 3000");

for (const item of tree.lnrValueLabels()) {
  console.log(item);
}
*/

const label = tree.aggregateUntil("/a @alfa 1000", "/e @epso 1000");

if (label) {
  console.log("Label for full range:", labelToString(label));
} else {
  console.log("No label");
}

// NEXT: Why does the label for the full range not match the label of b after generation?

// Are the generated labels wrong?
