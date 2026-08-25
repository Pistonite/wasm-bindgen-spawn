import { configure } from "mono-dev/app-build-config";
import type { UserConfig } from "mono-dev/vite";

export default configure(<UserConfig>{
    server: {
        headers: {
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Opener-Policy": "same-origin",
        },
    },
});
