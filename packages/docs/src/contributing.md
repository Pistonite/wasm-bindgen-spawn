# Contributing

> [!IMPORTANT]
> Please refer to [`mono-dev`](https://mono.pistonite.dev/standard.html)
> for contribution guidelines and tools setup for my projects.
>
> You will need to set up tools for Rust and TypeScript. The instructions
> are in the link above.
>
> You will also need `Bun` for building the JS code.
>
> If you want to run the e2e tests, you need to install:
> - `Deno` to run tests for deno
> - `docker` to build the playwright container for browser tests

## Repo Setup
After cloning the repo, `cd` to the repo and run the following commands:
```
pnpm install
task install
task icets
# ^ this installs additional tools directly on your system,
# please read Taskfile.yml before running
```

## Building the library
> [!CAUTION]
> The `build-abort` and `build-unwind` packages are meta files for building
> the example crate and the library itself using either `panic=abort` or `panic=unwind`.
>
> Do not run `cargo build` or `cargo build --target wasm32-unknown-unknown`
> in either the `example` or `lib` packages, as those packages by themselves
> lack the cargo config to build.

`cd` to the `test` package and run:
```
task build
```
This will build the example crate using `panic=abort` and `panic=unwind`,
as well as generating bundles for testing.

## Run the tests
The test task accepts the following flags:
```
task run -- --<engine>... -E<test> TRIPLES... [-1]

--<engine>: specify the engines to run the tests on, for example --node only uses NodeJS
-E<test>: specify test filters, for example -Ejoin only runs tests with 'join' in the name
TRIPLES: specify triple filters, for example 'debug' only runs tests built with debug profile
-1: special flag to only run tests for the first triple after filtering the triples
```

For example, if you make a change, the minimal test procedure is:
```
task build
task run -- --node -1 abort
task run -- --node -1 unwind
```
This runs all test cases for both the abort and unwind panic strategies.

To test the browsers, you have 2 options:
- Ensure you have `docker` installed and run a browser e2e test such as `task run -- --chrome`
- Alternatively, build the playground website and manually run the examples:
  - Run `task dev` in the `website` package.

## Checks
Run `task check` in the root of the repo to run all linters and formatters.
Run `task fix` to automatically fix formatting issues.

