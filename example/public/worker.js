console.log("importing WASM module in worker");
importScripts("/pkg/example.js");
(async function () {
  console.log("initializing WASM module in worker");
  await wasm_bindgen({ module_or_path: "/pkg/example_bg.wasm" });
  await wasm_bindgen.init_wasm_module();

  self.onmessage = function ({ data }) {
    wasm_bindgen[data]();
  };
})();
