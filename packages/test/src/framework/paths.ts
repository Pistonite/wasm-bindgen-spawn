import path from "node:path";

export const TARGET_TEST = path.resolve(import.meta.dirname, "../../target/test");
export const TARGET_BUNDLE = path.resolve(import.meta.dirname, "../../target/bundle");
export const TARGET_FRAMEWORK = path.resolve(import.meta.dirname, "../../target/framework");
export const PACKAGE_DIR = path.resolve(import.meta.dirname, "../..");
