# 1.0.2

- Improved efficiency of reconciliation by no longer re-sending any payloads
  which were just received. This reduces the number of messages sent and the
  overhead needed to process them.

# 1.0.1

- Fixes a bug which caused value types to be used as fingerprints when
  calculating fingerprints for certain kinds of ranges.

# 1.0.0

- Added `getType` to `RangeMessengerConfig.decode`
- Improved performance of fingerprint calculations

# 0.1.2

- Removed a stray console.log.

# 0.1.1

- Fixed an edge-case where a payload series with a single item would cause the
  RangeMessenger to create an invalid collated item.
