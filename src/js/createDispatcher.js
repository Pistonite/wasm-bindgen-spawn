return (async function () {
    const wbg = await (await fetch(args[1])).text();
    const DISPATCHER =
        wbg +
        `
self.onmessage=async(_)=>{const{recv:a,start_send:i,url:o,memory:t,wasm:n}=_.data;await wasm_bindgen({memory:t,module_or_path:n}),wasm_bindgen.__dispatch_start(i);while(!0){const r=wasm_bindgen.__dispatch_recv(a);if(!r)break;const[w,d,m,c,p]=r;await new Promise((e)=>{const s=new Worker(o);s.onmessage=({data:g})=>{if(g)return s.postMessage({id:w,f:d,send:m,start:c,memory:t,wasm:n}),e();s.terminate()}});while(!wasm_bindgen.__dispatch_poll_worker(p))await new Promise((e)=>setTimeout(e,0))}wasm_bindgen.__dispatch_drop(a),self.postMessage(0)};self.postMessage(1);

`;
    const dispatcherUrl = URL.createObjectURL(
        new Blob([DISPATCHER], { type: "text/javascript" }),
    );
    const WORKER =
        wbg +
        `
self.onmessage=async(n)=>{const{id:s,f:_,send:a,start:o,memory:r,wasm:t}=n.data;await wasm_bindgen({memory:r,module_or_path:t});try{const e=wasm_bindgen.__worker_main(_,o);wasm_bindgen.__worker_send(s,a,e)}catch(e){self.console.error(e),wasm_bindgen.__worker_send(s,a)}self.postMessage(0)};self.postMessage(1);

`;
    const workerUrl = URL.createObjectURL(
        new Blob([WORKER], { type: "text/javascript" }),
    );
    const wasm = await (await fetch(args[0])).arrayBuffer();
    const memory = args[2];
    const recv = args[3];
    const start_send = args[4];
    const start_recv = args[5];
    const __dispatch_poll_worker = args[6];
    const dispatcher = new Worker(dispatcherUrl);
    await new Promise((resolve) => {
        dispatcher.onmessage = ({ data }) => {
            if (data) {
                resolve();
                dispatcher.postMessage({
                    recv,
                    start_send,
                    url: workerUrl,
                    memory,
                    wasm,
                });
                return;
            }
            URL.revokeObjectURL(dispatcherUrl);
            URL.revokeObjectURL(workerUrl);
            dispatcher.terminate();
        };
    });
    while (!__dispatch_poll_worker(start_recv)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
})();
