import { RedBlackTree } from "https://deno.land/std@0.158.0/collections/red_black_tree.ts";
import {
  Direction,
  RedBlackNode,
} from "https://deno.land/std@0.158.0/collections/red_black_node.ts";
import { Monoid, RangeSeries } from "./types.ts";

export class AugmentedNode<
  ValueType = string,
  LiftType = string,
  NeutralType = string,
> extends RedBlackNode<ValueType> {
  declare parent: AugmentedNode<ValueType, LiftType, NeutralType> | null;
  declare left: AugmentedNode<ValueType, LiftType, NeutralType> | null;
  declare right: AugmentedNode<ValueType, LiftType, NeutralType> | null;

  label: LiftType | NeutralType;
  liftedValue: LiftType;

  private monoid: Monoid<ValueType, LiftType, NeutralType>;

  constructor(
    parent: AugmentedNode<ValueType, LiftType, NeutralType> | null,
    value: ValueType,
    monoid: Monoid<ValueType, LiftType, NeutralType>,
  ) {
    super(parent, value);

    this.label = monoid.neutral;
    this.liftedValue = monoid.lift(value);
    this.monoid = monoid;
    //this.valueHash = hash(new TextEncoder().encode(value as unknown as string));
  }

  updateLabel(updateParent = true, reason?: string) {
    console.group("Updating...", this.value);

    if (reason) {
      console.log(reason);
    }

    console.log("Lifted value", this.liftedValue);
    console.log(
      "Label L",
      this.left?.label || this.monoid.neutral,
    );
    console.log(
      "Label R",
      this.right?.label || this.monoid.neutral,
    );

    // Update our label
    this.label = this.monoid.combine(
      this.left?.label || this.monoid.neutral,
      this.monoid.combine(
        this.liftedValue,
        this.right?.label || this.monoid.neutral,
      ),
    );

    console.log();
    console.log("Label", this.label);

    console.groupEnd();

    // Update all parent labels all the way to the top...
    if (updateParent) {
      this.parent?.updateLabel(true, "Updated by child");
    }
  }
}

export class AugmentedTree<V, L, N> extends RedBlackTree<V> {
  declare protected root: AugmentedNode<V, L, N> | null;

  private monoid: Monoid<V, L, N>;

  constructor(monoid: Monoid<V, L, N>, compare: (a: V, b: V) => number) {
    super(compare);

    this.monoid = monoid;
  }

  rotateNode(node: AugmentedNode<V, L, N>, direction: Direction) {
    const replacementDirection: Direction = direction === "left"
      ? "right"
      : "left";
    if (!node[replacementDirection]) {
      throw new TypeError(
        `cannot rotate ${direction} without ${replacementDirection} child`,
      );
    }

    console.group("Rotating", direction);

    const replacement: AugmentedNode<V, L, N> = node[replacementDirection]!;
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
    parent: AugmentedNode<V, L, N> | null,
    current: AugmentedNode<V, L, N> | null,
  ) {
    while (parent && !current?.red) {
      const direction: Direction = parent.left === current ? "left" : "right";
      const siblingDirection: Direction = direction === "right"
        ? "left"
        : "right";
      let sibling: AugmentedNode<V, L, N> | null = parent[siblingDirection];

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

  insertAugmentedNode(
    value: V,
  ): AugmentedNode<V, L, N> | null {
    if (!this.root) {
      this.root = new AugmentedNode(null, value, this.monoid);
      this._size++;
      return this.root;
    } else {
      let node: AugmentedNode<V, L, N> = this.root;
      while (true) {
        const order: number = this.compare(value, node.value);
        if (order === 0) break;
        const direction: Direction = order < 0 ? "left" : "right";
        if (node[direction]) {
          node = node[direction]!;
        } else {
          node[direction] = new AugmentedNode(null, value, this.monoid);
          this._size++;
          return node[direction];
        }
      }
    }
    return null;
  }

  insert(value: V): boolean {
    console.group("Inserting", value);

    const originalNode = this.insertAugmentedNode(
      value,
    );

    let node = originalNode;

    if (node) {
      while (node.parent?.red) {
        let parent: AugmentedNode<V, L, N> = node.parent!;
        const parentDirection: Direction = parent.directionFromParent()!;
        const uncleDirection: Direction = parentDirection === "right"
          ? "left"
          : "right";

        // The uncle is the sibling on the same side of the parent's parent.
        const uncle: AugmentedNode<V, L, N> | null =
          parent.parent![uncleDirection] ??
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
    const node = this.removeNode(value) as (AugmentedNode<V, L, N> | null);

    if (node && !node.red) {
      this.removeFixup(node.parent, node.left ?? node.right);
    }

    if (node) {
      node.parent?.updateLabel(true, "Succeeded");
    }

    return !!node;
  }

  // NEXT: Fingerprint ranges

  // input is a bunch of sequential ranges
  // first item can be empty (so from the beginning...)
  //
  getFingerPrints(series: RangeSeries<V>): (L | N)[] {
    if (this.root === null) {
      return [];
    }

    const [head, mid, tail] = series;

    const first = head || this.root.findMinNode().value;
    const last = tail || this.monoid.oneBigger(this.root.findMaxNode().value);

    const combined = [first, ...mid, last];

    let nodeToPass: AugmentedNode<V, L, N> | null = head
      ? this.findGteNode(head) as AugmentedNode<V, L, N>
      : this.root.findMinNode() as AugmentedNode<V, L, N>;

    const fingerprints: (L | N)[] = [];

    for (let i = 0; i < combined.length - 1; i++) {
      if (nodeToPass === null) {
        break;
      }

      const x = combined[i];
      const y = combined[i + 1];

      console.log(x, y);

      const { label, nextTree } = this.aggregateUntil(nodeToPass, x, y);

      nodeToPass = nextTree;
      fingerprints.push(label);
    }

    return fingerprints;
  }

  private findGteNode(
    value: V,
  ): AugmentedNode<V, L, N> | null {
    let node: AugmentedNode<V, L, N> | null = this.root;
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
    node: AugmentedNode<V, L, N>,
    x: V,
    y: V,
  ): { label: L | N; nextTree: AugmentedNode<V, L, N> | null } {
    // if x === y

    const { label, nextTree } = this.aggregateUp(node, x, y);

    if (nextTree === null || this.compare(nextTree.value, y) > 0) {
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
    node: AugmentedNode<V, L, N>,
    x: V,
    y: V,
  ): { label: L | N; nextTree: AugmentedNode<V, L, N> | null } {
    let acc: L | N = this.monoid.neutral;
    let tree = node;

    while (tree.findMaxNode().value < y) {
      if (tree.value >= x) {
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
    node: AugmentedNode<V, L, N> | null,
    y: V,
    acc: L | N,
  ): { label: L | N; nextTree: AugmentedNode<V, L, N> | null } {
    let tree = node;
    let acc2 = acc;

    while (tree !== null) {
      if (tree.value < y) {
        acc2 = this.monoid.combine(
          acc2,
          this.monoid.combine(
            tree.left?.label || this.monoid.neutral,
            tree.liftedValue,
          ),
        );

        if (tree.right) {
          tree = tree.right;
        }
      } else if (tree.left === null || tree.left.findMaxNode().value < y) {
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
