# Range-based set reconciliation

A module for the efficient reconciliation of sets. This is a TypeScript
implementation of range-based set reconciliation as described in
[Aljoscha Meyer's master thesis](https://github.com/AljoschaMeyer/master_thesis).

In this method peers generate fingerprints for ranges of items they hold in a
totally ordered set.

When two ranges from different peers hold the same items, they produce the same
fingerprint.

But when two ranges from different peers are different from one another, they
produce different fingeprints. The two peers then subdivide non-matching ranges,
generating and comparing fingerprints until the ranges are whittled down to the
disjoint elements, which are then exchanged.

## About this implementation

This implementation of this implementation has the following features:

- A reasonably fast self-balancing `FingerprintTree` built upon Deno's std
  `RedBlackTree`. This is used to hold your set's values and generate
  fingerprints for ranges.
- BYOLM (Bring your own Lifting Monoid) - Fingerprinting is made possible by a
  'lifting monoid', a monoid with an additional function that 'lifts' a value
  into another kind of value (e.g. a hashing function).
- An efficient message-based protocol for describing ranges between peers which
  can be used locally or over a network.
- BYOE (Bring Your Own Encoding) - How messages are encoded and decoded is left
  to the user.
- BYOT (Bring Your Own Transport)- `RangeMessenger` has a single `respond`
  method which takes and returns an encoded message, which you then transport to
  the other peer in whichever way you prefer.

One caveat: the `FingerprintTree` provided by this module can only persist its
values in memory.

## Using this moudule

### Outline

At the broadest level:

1. For each set you wish to reconcile, instantiate a `FingerprintTree` and
   insert that set's elements.
2. Create a `RangeMessenger` for each `FingerprintTree`.
3. Reconcile the sets by exchanging messages between two `RangeMessengers`.

### Detailed usage

#### FingerprintTree

The `FingerprintTree` is used as the representation of a set you wish to
reconcile. Instantiation requires a 'lifting monoid' to be provided, and
optionally a function with which to compare inserted values.

The lifting monoid must satisfy the following criteria:

1. The lift method should create a unique value within the universe of the set,
   where each possible value of the set has a unique lifted value (must ask
   aljoscha to get this right, I know this isn't)
2. The combine method must be associative — i.e.
   `combine(a, combine(b, c)) === combine(combine(a, b), c)`
3. The neutral method is a constant value which does not affect the outcome of
   the combine method (ask... aljoscha...)

If no comparison function is provided, `FingerprintTree` will use JavaScript's
built in comparison instead. You have been warned!

#### RangeMessenger

Once you have a FingerprintTree containing the values you wish to reconcile, you
can instantiate a `RangeMessenger` which generates the messages for another
peer.

This `RangeMessenger` requires a configuration which describes how to decode and
encode messages from and to the other peer respectively.

Once instantiated, the initial messages to send the other peer can be generated
with the `initialMessages` method.

Upon receiving a message, it should be passed to `RangeMessenger.respond`, which
returns the response to be sent back in turn.

How messages are sent and received are up to you. Just make sure that whichever
system you choose sends and processes the messages in order (i.e. first-in,
first-out).

## Development

This module uses Deno as its development runtime.
[Installation instructions can be found here](https://deno.land/#installation).

Documentation can be viewed with `deno doc mod.ts`.

Tests can be run with `deno task test`.

Benchmarks can be run with `deno task bench`.

## TODO

- [ ] Make b and k of MessageBroker configurable.
- [ ] Create comparative benchmarks for syncing with changing b / k.
- [ ] Add `onInsertedValue` callback subscriber to `RangeMessenger` (i.e. to
      trigger Earthstar checking if it wants a doc thumbnail)
