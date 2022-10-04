import { multiXor, xor } from "./fingerprints_labels.ts";
import { AugmentedNode } from "./tree.ts";
import { DocThumbnailEncoded } from "./types.ts";

export function aggregateUntil(
  node: AugmentedNode,
  x: DocThumbnailEncoded,
  y: DocThumbnailEncoded,
): { label: Uint8Array; nextTree: AugmentedNode | null } {
  const { label, nextTree } = aggregateUp(node, x, y);

  if (nextTree === null || nextTree.value >= y || nextTree.right === null) {
    return { label, nextTree };
  } else {
    return aggregateDown(nextTree.right, y, xor(label, nextTree.valueHash));
  }
}

function aggregateUp(
  node: AugmentedNode,
  x: DocThumbnailEncoded,
  y: DocThumbnailEncoded,
): { label: Uint8Array; nextTree: AugmentedNode | null } {
  let acc = undefined;
  let tree = node;

  while (tree.findMaxNode().value < y) {
    if (tree.value >= x) {
      acc = multiXor(acc, tree.valueHash, tree.right?.label);
    }

    if (tree.parent === null) {
      return { label: acc || new Uint8Array(8), nextTree: null };
    } else {
      tree = tree.parent;
    }
  }

  return { label: acc || new Uint8Array(8), nextTree: tree };
}

function aggregateDown(
  node: AugmentedNode,
  y: DocThumbnailEncoded,
  acc: Uint8Array,
) {
  let tree = node;
  let acc2 = acc;

  while (true) {
    if (tree.value < y) {
      acc2 = multiXor(acc2, tree.left?.label, tree.valueHash);

      if (tree.right) {
        tree = tree.right;
      }
    } else if (tree.left === null || tree.left.findMaxNode().value < y) {
      return { label: multiXor(acc2, tree.left?.label), nextTree: tree };
    } else {
      tree = tree.left;
    }
  }
}

// NEXT: Why does the print for the full range
