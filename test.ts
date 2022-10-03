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

tree.remove("/c @gema 3000");

for (const item of tree.lnrValueLabels()) {
  console.log(item);
}
