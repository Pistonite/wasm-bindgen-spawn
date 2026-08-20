---
name: create-test
description: Create a log assertion test based on the rust example
---

You are creating a test for the wasm-bindgen-spawn library, a Rust library
to spawn WASM threads using web worker and shared memory buffer and atomics.


# Step 1: Read the example in Rust
See packages/example/examples/*.rs, find the test method
`example_xxxx` where xxxx is the test name, understand what the test is doing

# Step 2: Read the logs
Once you understand what the test is doing, read the logs
at packages/test/target/test/<engine>/<quad>.log.
Use the `log` task in that package:
```
task log -- -Ename_of_the_test
```
This will dump just the logs for that test

# Step 3: Implement the assertions
The tests read the log and assert on the trace messages.

The tests should cover:
1. Correctness of the output
2. Behavior of multithreading/parallelism, for example
   are there evidence of things actually running on multiple threads
3. (If applicable) timing for the messages match the sleep pattern of the test

# Step 4: Revisit + Rethink

- Does your test have duplicated utils with other tests that can be
  refactored to util.ts?
  - do not refactor framework utils, only utils used in the tests (things you need
    to extract logs, etc); do not refactor simple, short oneline utils
    since it adds unnecessary complexity
- Is your test reliable (is it going to fail when running in CI
  where the machine is speced differently (often much slower?
