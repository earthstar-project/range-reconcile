import { RedBlackTree } from "https://deno.land/std@0.158.0/collections/red_black_tree.ts";
import {
  Direction,
  RedBlackNode,
} from "https://deno.land/std@0.158.0/collections/red_black_node.ts";
import { combineMonoid, Monoid, sizeMonoid } from "./monoid.ts";

const debug = false;

export class FingerprintNode<
  ValueType = string,
  LiftType = string,
  NeutralType = string,
> extends RedBlackNode<ValueType> {
  declare parent: FingerprintNode<ValueType, LiftType, NeutralType> | null;
  declare left: FingerprintNode<ValueType, LiftType, NeutralType> | null;
  declare right: FingerprintNode<ValueType, LiftType, NeutralType> | null;

  fingerprint: LiftType | NeutralType;
  liftedValue: LiftType;

  private monoid: Monoid<ValueType, LiftType, NeutralType>;

  constructor(
    parent: FingerprintNode<ValueType, LiftType, NeutralType> | null,
    value: ValueType,
    monoid: Monoid<ValueType, LiftType, NeutralType>,
  ) {
    super(parent, value);

    this.fingerprint = monoid.neutral;
    this.liftedValue = monoid.lift(value);
    this.monoid = monoid;
  }

  updateLabel(updateParent = true, reason?: string) {
    // Update our label
    this.fingerprint = this.monoid.combine(
      this.left?.fingerprint || this.monoid.neutral,
      this.monoid.combine(
        this.liftedValue,
        this.right?.fingerprint || this.monoid.neutral,
      ),
    );

    if (debug) {
      if (reason) {
        console.log(reason);
      }
      console.group("Updating...", this.value);
      console.log("Lifted value", this.liftedValue);
      console.log(
        "Label L",
        this.left?.fingerprint || this.monoid.neutral,
      );
      console.log(
        "Label R",
        this.right?.fingerprint || this.monoid.neutral,
      );
      console.log("Label", this.fingerprint);
      console.groupEnd();
    }

    // Update all parent labels all the way to the top...
    if (updateParent) {
      this.parent?.updateLabel(true, "Updated by child");
    }
  }
}

type NodeType<V, L, N> = FingerprintNode<V, [L, [number, V[]]], [N, [0, []]]>;
type CombinedLabel<V, L> = [L, [number, V[]]];
type CombinedNeutral<N> = [N, [0, []]];

export class FingerprintTree<V, L, N> extends RedBlackTree<V> {
  declare protected root:
    | NodeType<V, L, N>
    | null;

  monoid: Monoid<V, [L, [number, V[]]], [N, [0, []]]>;

  constructor(
    monoid: Monoid<V, L, N>,
    compare?: (a: V, b: V) => number,
  ) {
    super(compare);

    this.monoid = combineMonoid(
      monoid,
      combineMonoid(sizeMonoid, {
        lift: (v: V) => [v],
        combine: (a: V[], b: V[]) => {
          return a.concat(b);
        },
        neutral: [],
      }),
    );
  }

  rotateNode(
    node: NodeType<V, L, N>,
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

    const replacement: NodeType<V, L, N> = node[replacementDirection]!;
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
    parent: NodeType<V, L, N> | null,
    current: NodeType<V, L, N> | null,
  ) {
    while (parent && !current?.red) {
      const direction: Direction = parent.left === current ? "left" : "right";
      const siblingDirection: Direction = direction === "right"
        ? "left"
        : "right";
      let sibling: NodeType<V, L, N> | null = parent[siblingDirection];

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
    value: V,
  ): NodeType<V, L, N> | null {
    if (!this.root) {
      this.root = new FingerprintNode(null, value, this.monoid);
      this._size++;
      return this.root;
    } else {
      let node: NodeType<V, L, N> = this.root;
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

  insert(value: V): boolean {
    const originalNode = this.insertFingerprintNode(
      value,
    );

    let node = originalNode;

    if (node) {
      while (node.parent?.red) {
        let parent: NodeType<V, L, N> = node
          .parent!;
        const parentDirection: Direction = parent.directionFromParent()!;
        const uncleDirection: Direction = parentDirection === "right"
          ? "left"
          : "right";

        // The uncle is the sibling on the same side of the parent's parent.
        const uncle:
          | NodeType<V, L, N>
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

    console.groupEnd();

    return !!node;
  }

  override remove(value: V): boolean {
    const node = this.removeNode(
      value,
    ) as (NodeType<V, L, N> | null);

    if (node && !node.red) {
      this.removeFixup(node.parent, node.left ?? node.right);
    }

    if (node) {
      node.parent?.updateLabel(true, "Succeeded");
    }

    return !!node;
  }

  getFingerprint(x: V, y: V, nextTree?: NodeType<V, L, N>): {
    fingerprint: L | N;
    size: number;
    items: V[];
    nextTree: NodeType<V, L, N> | null;
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
    ) as NodeType<V, L, N>;

    const order = this.compare(x, y);

    if (order === 0) {
      return {
        fingerprint: this.root.fingerprint[0],
        size: this.root.fingerprint[1][0],
        items: this.root.fingerprint[1][1],
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
        this.compare(maxNode.value, x) > 0
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
        minNode as NodeType<V, L, N>,
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

  private findGteNode(
    value: V,
  ): NodeType<V, L, N> | null {
    let node: NodeType<V, L, N> | null = this.root;
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
    node: NodeType<V, L, N>,
    x: V,
    y: V,
  ): {
    label: CombinedLabel<V, L> | CombinedNeutral<N>;
    nextTree: NodeType<V, L, N> | null;
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
    node: NodeType<V, L, N>,
    x: V,
    y: V,
  ): {
    label: CombinedLabel<V, L> | CombinedNeutral<N>;
    nextTree: NodeType<V, L, N> | null;
  } {
    let acc: CombinedLabel<V, L> | CombinedNeutral<N> = this.monoid.neutral;
    let tree = node;

    while (tree.findMaxNode().value < y) {
      if (tree.value >= x) {
        acc = this.monoid.combine(
          acc,
          this.monoid.combine(
            tree.liftedValue,
            tree.right?.fingerprint || this.monoid.neutral,
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
    node: NodeType<V, L, N> | null,
    y: V,
    acc: CombinedLabel<V, L> | CombinedNeutral<N>,
  ): {
    label: CombinedLabel<V, L> | CombinedNeutral<N>;
    nextTree: NodeType<V, L, N> | null;
  } {
    let tree = node;
    let acc2 = acc;

    while (tree !== null) {
      if (tree.value < y) {
        acc2 = this.monoid.combine(
          acc2,
          this.monoid.combine(
            tree.left?.fingerprint || this.monoid.neutral,
            tree.liftedValue,
          ),
        );

        tree = tree.right;
      } else if (tree.left === null || tree.left.findMaxNode().value < y) {
        return {
          label: this.monoid.combine(
            acc2,
            tree.left?.fingerprint || this.monoid.neutral,
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
