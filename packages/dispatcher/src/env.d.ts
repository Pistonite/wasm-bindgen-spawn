/// <reference lib="webworker" />
/// <reference types="mono-dev/app-types" />

// debug only log. will be stripped in non-debug mode
declare const __debug: (...x: unknown) => void;
// injected, debug only init code. will be stripped in non-debug mode
declare const __debug_init: () => Promise<void>;
