/**
 * Tools for efficient reconciliation of sets. This is an implementation of range-based set reconciliation as described in Aljoscha Meyer's master thesis (https://github.com/AljoschaMeyer/master_thesis).
 *
 * At the broadest level:
 * 1. For each set you wish to reconcile, instantiate a FingerprintTree and insert that set's elements.
 * 2. Create a RangeMessenger for each FingerprintTree.
 * 3. Reconcile the sets by exchanging messages between two RangeMessengers.
 *
 * Reconciliation can be conducted locally or over a network.
 * This library does not have any opinion on message encoding or transport. Users provide these details themselves.
 * Currently the FingerprintTrees are persisted only in memory.
 *
 * @module
 */

export * from "./src/fingerprint_tree/fingerprint_tree.ts";
export * from "./src/range_messenger/range_messenger.ts";
export * from "./src/lifting_monoid.ts";
export * from "./src/util.ts";
