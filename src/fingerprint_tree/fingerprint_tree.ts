import { RedBlackTree } from "https://deno.land/std@0.158.0/collections/red_black_tree.ts";
import {
  Direction,
  RedBlackNode,
} from "https://deno.land/std@0.158.0/collections/red_black_node.ts";
import { combineMonoid, LiftingMonoid, sizeMonoid } from "../lifting_monoid.ts";

const debug = false;

/** A node for a FingerprintTree, augmented with a label and lifted value. Can update the labelsk of its ancestors. */
export class FingerprintNode<
  ValueType = string,
  LiftType = string,
> extends RedBlackNode<ValueType> {
  declare parent: FingerprintNode<ValueType, LiftType> | null;
  declare left: FingerprintNode<ValueType, LiftType> | null;
  declare right: FingerprintNode<ValueType, LiftType> | null;

  label: LiftType;
  liftedValue: LiftType;

  private monoid: LiftingMonoid<ValueType, LiftType>;

  constructor(
    parent: FingerprintNode<ValueType, LiftType> | null,
    value: ValueType,
    monoid: LiftingMonoid<ValueType, LiftType>,
  ) {
    super(parent, value);

    this.label = monoid.neutral;
    this.liftedValue = monoid.lift(value);
    this.monoid = monoid;
  }

  updateLabel(updateParent = true, reason?: string) {
    // Update our label
    if (this.left !== null && this.right === null) {
      this.label = this.monoid.combine(
        this.left.label,
        this.liftedValue,
      );
    } else if (this.left === null && this.right !== null) {
      this.label = this.monoid.combine(
        this.liftedValue,
        this.right.label,
      );
    } else if (this.left && this.right) {
      this.label = this.monoid.combine(
        this.left?.label || this.monoid.neutral,
        this.monoid.combine(
          this.liftedValue,
          this.right?.label || this.monoid.neutral,
        ),
      );
    } else {
      this.label = this.liftedValue;
    }

    if (debug) {
      if (reason) {
        console.log(reason);
      }
      console.group("Updating...", this.value);
      console.log("Lifted value", this.liftedValue);
      console.log(
        "Label L",
        this.left?.label || this.monoid.neutral,
      );
      console.log(
        "Label R",
        this.right?.label || this.monoid.neutral,
      );
      console.log("Label", this.label);
      console.groupEnd();
    }

    // Update all parent labels all the way to the top...
    if (updateParent) {
      this.parent?.updateLabel(true, "Updated by child");
    }
  }
}

export type NodeType<V, L> = FingerprintNode<V, [L, [number, V[]]]>;
type CombinedLabel<V, L> = [L, [number, V[]]];

/** A self-balancing tree which can return fingerprints for ranges of items it holds using a provided monoid. */
export class FingerprintTree<ValueType, LiftedType>
  extends RedBlackTree<ValueType> {
  declare protected root:
    | NodeType<ValueType, LiftedType>
    | null;

  monoid: LiftingMonoid<ValueType, [LiftedType, [number, ValueType[]]]>;

  constructor(
    /** The lifting monoid which is used to label nodes and derive fingerprints from ranges. */
    monoid: LiftingMonoid<ValueType, LiftedType>,
    /** A function to sort values by. Will use JavaScript's default comparison if not provided. */
    compare?: (a: ValueType, b: ValueType) => number,
  ) {
    super(compare);

    this.monoid = combineMonoid(
      monoid,
      combineMonoid(sizeMonoid, {
        lift: (v: ValueType) => [v],
        combine: (a: ValueType[], b: ValueType[]) => {
          return a.concat(b);
        },
        neutral: [],
      }),
    );
  }

  /** Return the lowest value within this tree. Useful for constructing the maximum range of the tree, which will be [x, x) where x is the result of this function. */
  getLowestValue(): ValueType {
    if (!this.root) {
      throw new Error("Can't get a range from a tree with no items");
    }

    return this.root.findMinNode().value;
  }

  rotateNode(
    node: NodeType<ValueType, LiftedType>,
    direction: Direction,
  ) {
    const replacementDirection: Direction = direction === "left"
      ? "right"
      : "left";
    if (!node[replacementDirection]) {
      throw new TypeError(
        `cannot rotate ${direction} without ${replacementDirection} child`,
      );
    }

    if (debug) console.group("Rotating", direction);

    const replacement: NodeType<ValueType, LiftedType> =
      node[replacementDirection]!;
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

  removeFixup(
    parent: NodeType<ValueType, LiftedType> | null,
    current: NodeType<ValueType, LiftedType> | null,
  ) {
    while (parent && !current?.red) {
      const direction: Direction = parent.left === current ? "left" : "right";
      const siblingDirection: Direction = direction === "right"
        ? "left"
        : "right";
      let sibling: NodeType<ValueType, LiftedType> | null =
        parent[siblingDirection];

      if (sibling?.red) {
        sibling.red = false;
        parent.red = true;
        this.rotateNode(parent, direction);
        sibling = parent[siblingDirection];
      }
      if (sibling) {
        if (!sibling.left?.red && !sibling.right?.red) {
          sibling!.red = true;
          current = parent;
          parent = current.parent;
        } else {
          if (!sibling[siblingDirection]?.red) {
            sibling[direction]!.red = false;
            sibling.red = true;
            this.rotateNode(sibling, siblingDirection);
            sibling = parent[siblingDirection!];
          }
          sibling!.red = parent.red;
          parent.red = false;
          sibling![siblingDirection]!.red = false;
          this.rotateNode(parent, direction);
          current = this.root;
          parent = null;
        }
      }
    }
    if (current) current.red = false;
  }

  private insertFingerprintNode(
    value: ValueType,
  ): NodeType<ValueType, LiftedType> | null {
    if (!this.root) {
      this.root = new FingerprintNode(null, value, this.monoid);
      this._size++;
      return this.root;
    } else {
      let node: NodeType<ValueType, LiftedType> = this.root;
      while (true) {
        const order: number = this.compare(value, node.value);

        if (order === 0) break;
        const direction: Direction = order < 0 ? "left" : "right";
        if (node[direction]) {
          node = node[direction]!;
        } else {
          node[direction] = new FingerprintNode(node, value, this.monoid);
          this._size++;

          return node[direction];
        }
      }
    }
    return null;
  }

  /** Insert a value into the tree. Will create a lifted value for the resulting node, and update the labels of all rotated and parent nodes in the tree. */
  insert(value: ValueType): boolean {
    const originalNode = this.insertFingerprintNode(
      value,
    );

    let node = originalNode;

    if (node) {
      while (node.parent?.red) {
        let parent: NodeType<ValueType, LiftedType> = node
          .parent!;
        const parentDirection: Direction = parent.directionFromParent()!;
        const uncleDirection: Direction = parentDirection === "right"
          ? "left"
          : "right";

        // The uncle is the sibling on the same side of the parent's parent.
        const uncle:
          | NodeType<ValueType, LiftedType>
          | null = parent.parent![uncleDirection] ??
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

    return !!node;
  }

  /** Remove a value frem the tree. Will recalculate labels for all rotated and parent nodes. */
  override remove(value: ValueType): boolean {
    const node = this.removeNode(
      value,
    ) as (NodeType<ValueType, LiftedType> | null);

    if (node && !node.red) {
      this.removeFixup(node.parent, node.left ?? node.right);
    }

    if (node) {
      node.parent?.updateLabel(true, "Child node removed");
    }

    return !!node;
  }

  /** Calculates a fingerprint of items within the given range, inclusive of xx and exclusive of y. Also returns the size of the range, the items contained within it, */
  getFingerprint(
    x: ValueType,
    y: ValueType,
    nextTree?: NodeType<ValueType, LiftedType>,
  ): {
    /** The fingeprint of this range. */
    fingerprint: LiftedType;
    /** The size of the range. */
    size: number;
    /** The items within this range. */
    items: ValueType[];
    /** A tree to be used for a subsequent call of `getFingerprint`, where the given y param for the previous call is the x param for the next one. */
    nextTree: NodeType<ValueType, LiftedType> | null;
  } {
    if (this.root === null) {
      return {
        fingerprint: this.monoid.neutral[0],
        size: 0,
        items: [],
        nextTree: null,
      };
    }

    const nodeToPass = nextTree || this.findGteNode(
      x,
    ) as NodeType<ValueType, LiftedType>;

    const order = this.compare(x, y);

    if (order === 0) {
      return {
        fingerprint: this.root.label[0],
        size: this.root.label[1][0],
        items: this.root.label[1][1],
        nextTree: null,
      };
    } else if (order < 0) {
      const { label, nextTree } = this.aggregateUntil(
        nodeToPass,
        x,
        y,
      );

      return {
        fingerprint: label[0],
        size: label[1][0],
        items: label[1][1],
        nextTree,
      };
    } else {
      const minNode = this.root.findMinNode();
      const maxNode = this.root.findMaxNode();

      const { label: label0, nextTree: nextTree0 } = this.aggregateUntil(
        nodeToPass,
        x,
        maxNode.value,
      );

      const label = this.monoid.combine(
        label0,
        this.compare(maxNode.value, x) >= 0
          ? this.monoid.lift(maxNode.value)
          : this.monoid.neutral,
      );

      if (minNode.value === y) {
        return {
          fingerprint: label[0],
          size: label[1][0],
          items: label[1][1],
          nextTree: nextTree0,
        };
      }

      const { label: label2, nextTree } = this.aggregateUntil(
        minNode as NodeType<ValueType, LiftedType>,
        minNode.value,
        y,
      );

      const combined = this.monoid.combine(label2, label);

      return {
        fingerprint: combined[0],
        size: combined[1][0],
        items: combined[1][1],
        nextTree,
      };
    }
  }

  /** Find the first node holding a value greater than or equal to the given value. */
  private findGteNode(
    value: ValueType,
  ): NodeType<ValueType, LiftedType> | null {
    let node: NodeType<ValueType, LiftedType> | null = this.root;
    while (node) {
      const order: number = this.compare(value, node.value);
      if (order === 0) break;
      const direction: "left" | "right" = order < 0 ? "left" : "right";

      if (node[direction]) {
        node = node[direction];
      } else {
        break;
      }
    }
    return node;
  }

  private aggregateUntil(
    node: NodeType<ValueType, LiftedType>,
    x: ValueType,
    y: ValueType,
  ): {
    label: CombinedLabel<ValueType, LiftedType>;
    nextTree: NodeType<ValueType, LiftedType> | null;
  } {
    const { label, nextTree } = this.aggregateUp(node, x, y);

    if (nextTree === null || this.compare(nextTree.value, y) >= 0) {
      return { label, nextTree };
    } else {
      return this.aggregateDown(
        nextTree.right,
        y,
        this.monoid.combine(label, nextTree.liftedValue),
      );
    }
  }

  private aggregateUp(
    node: NodeType<ValueType, LiftedType>,
    x: ValueType,
    y: ValueType,
  ): {
    label: CombinedLabel<ValueType, LiftedType>;
    nextTree: NodeType<ValueType, LiftedType> | null;
  } {
    let acc: CombinedLabel<ValueType, LiftedType> = this.monoid.neutral;
    let tree = node;

    while (this.compare(tree.findMaxNode().value, y) < 0) {
      if (this.compare(tree.value, x) >= 0) {
        acc = this.monoid.combine(
          acc,
          this.monoid.combine(
            tree.liftedValue,
            tree.right?.label || this.monoid.neutral,
          ),
        );
      }

      if (tree.parent === null) {
        return { label: acc, nextTree: null };
      } else {
        tree = tree.parent;
      }
    }

    return { label: acc, nextTree: tree };
  }

  private aggregateDown(
    node: NodeType<ValueType, LiftedType> | null,
    y: ValueType,
    acc: CombinedLabel<ValueType, LiftedType>,
  ): {
    label: CombinedLabel<ValueType, LiftedType>;
    nextTree: NodeType<ValueType, LiftedType> | null;
  } {
    let tree = node;
    let acc2 = acc;

    while (tree !== null) {
      if (this.compare(tree.value, y) < 0) {
        acc2 = this.monoid.combine(
          acc2,
          this.monoid.combine(
            tree.left?.label || this.monoid.neutral,
            tree.liftedValue,
          ),
        );

        tree = tree.right;
      } else if (
        tree.left === null || this.compare(tree.left.findMaxNode().value, y) < 0
      ) {
        return {
          label: this.monoid.combine(
            acc2,
            tree.left?.label || this.monoid.neutral,
          ),
          nextTree: tree,
        };
      } else {
        tree = tree.left;
      }
    }
    return { label: acc2, nextTree: null };
  }
}
