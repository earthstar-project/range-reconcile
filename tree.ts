import { RedBlackTree } from "https://deno.land/std@0.158.0/collections/red_black_tree.ts";
import {
  Direction,
  RedBlackNode,
} from "https://deno.land/std@0.158.0/collections/red_black_node.ts";

import { hash, labelToString, makeLabel } from "./fingerprints_labels.ts";
import { DocThumbnailEncoded } from "./types.ts";
import { compareDocThumbnail } from "./util.ts";

class AugmentedNode<T = DocThumbnailEncoded> extends RedBlackNode<T> {
  declare parent: AugmentedNode<T> | null;
  declare left: AugmentedNode<T> | null;
  declare right: AugmentedNode<T> | null;

  label: Uint8Array = new Uint8Array(8);

  private valueHash: Uint8Array;

  constructor(parent: AugmentedNode<T> | null, value: T) {
    super(parent, value);

    this.valueHash = hash(new TextEncoder().encode(value as unknown as string));
  }

  updateLabel(updateParent = true, reason?: string) {
    console.group("Updating...", this.value);

    if (reason) {
      console.log(reason);
    }

    console.log("Hash", labelToString(this.valueHash));
    console.log(
      "Left",
      this.left?.label ? labelToString(this.left.label) : "(none)",
    );
    console.log(
      "Right",
      this.right?.label ? labelToString(this.right.label) : "(none)",
    );

    // Update our label
    this.label = makeLabel(
      this.valueHash,
      this.left?.label || new Uint8Array(8),
      this.right?.label || new Uint8Array(8),
    );

    console.log();
    console.log("Label", labelToString(this.label));

    console.groupEnd();

    // Update all parent labels all the way to the top...
    if (updateParent) {
      this.parent?.updateLabel(true, "Updated by child");
    }
  }
}

export class AugmentedTree extends RedBlackTree<DocThumbnailEncoded> {
  declare protected root: AugmentedNode | null;

  constructor() {
    super(compareDocThumbnail);
  }

  rotateNode(node: AugmentedNode, direction: Direction) {
    const replacementDirection: Direction = direction === "left"
      ? "right"
      : "left";
    if (!node[replacementDirection]) {
      throw new TypeError(
        `cannot rotate ${direction} without ${replacementDirection} child`,
      );
    }

    console.group("Rotating", direction);

    const replacement: AugmentedNode = node[replacementDirection]!;
    node[replacementDirection] = replacement[direction] ?? null;

    // if the replacement has a node in the rotation direction
    // the node is now the parent of that node

    // so p.r (b) now has q as a parent
    if (replacement[direction]) {
      replacement[direction]!.parent = node;
    }

    // and p's parent is now q's parent (nothing)
    replacement.parent = node.parent;

    if (node.parent) {
      const parentDirection: Direction = node === node.parent[direction]
        ? direction
        : replacementDirection;
      node.parent[parentDirection] = replacement;
    } else {
      // the root is now p
      this.root = replacement;
    }

    // and p's r is now q
    replacement[direction] = node;

    // and q's parent is now p. wow.
    node.parent = replacement;

    replacement[direction]?.updateLabel(false, "Node rotated");

    console.groupEnd();
  }

  // NEXT: update labels properly when new insertions happen

  insert(value: DocThumbnailEncoded): boolean {
    console.group("Inserting", value);

    const originalNode = this.insertNode(
      AugmentedNode,
      value,
    ) as (AugmentedNode | null);

    let node = originalNode;

    if (node) {
      while (node.parent?.red) {
        let parent: AugmentedNode = node.parent!;
        const parentDirection: Direction = parent.directionFromParent()!;
        const uncleDirection: Direction = parentDirection === "right"
          ? "left"
          : "right";

        // The uncle is the sibling on the same side of the parent's parent.
        const uncle: AugmentedNode | null = parent.parent![uncleDirection] ??
          null;

        if (uncle?.red) {
          parent.red = false;
          uncle.red = false;
          parent.parent!.red = true;

          node = parent.parent!;
        } else {
          if (node === parent[uncleDirection]) {
            node = parent;

            this.rotateNode(node, parentDirection);

            parent = node.parent!;
          }
          parent.red = false;
          parent.parent!.red = true;
          this.rotateNode(parent.parent!, uncleDirection);
        }
      }

      this.root!.red = false;
    }

    originalNode?.updateLabel(true, "Node inserted");

    console.groupEnd();

    return !!node;
  }

  *lnrValueLabels(): IterableIterator<[string, string]> {
    const nodes: AugmentedNode[] = [];
    let node: AugmentedNode | null = this.root;
    while (nodes.length || node) {
      if (node) {
        nodes.push(node);
        node = node.left;
      } else {
        node = nodes.pop()!;
        yield [node.value, labelToString(node.label)];
        node = node.right;
      }
    }
  }
}
