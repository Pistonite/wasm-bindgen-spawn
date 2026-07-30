import initialize, {init_wasm_module} from './pkg/example'
import * as whatever from './pkg/example';
import {Example} from "../../constants.ts";
import wbgUrl from "./pkg/example.js?url";
import wasmUrl from "./pkg/example_bg.wasm?url";

console.log("importing WASM module in worker");

(async function () {
	console.log("initializing WASM module in worker");
	await initialize();
	await init_wasm_module(wasmUrl, wbgUrl);

	self.onmessage = function ({data}: MessageEvent<Example>) {
		whatever[data]();
	};
})();
