import WASM_ICON_SRC from "./wasm.svg";

import "./wasm_icon.css";

export const WasmIcon: React.FC = () => {
    return (
        <img className="wasm-icon" src={WASM_ICON_SRC} width={26} height={26} alt="WebAssembly" />
    );
};
