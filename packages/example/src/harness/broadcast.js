const bc = new BroadcastChannel("wbgspawn-harness");
return (msg) => bc.postMessage(msg);
