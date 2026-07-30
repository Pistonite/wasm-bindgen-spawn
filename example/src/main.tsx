import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import "./index.css";
import {BrowserRouter, Navigate, Outlet, Route, Routes, useLocation} from "react-router";
import WebExample from "./pages/web";
import NoModulesExample from "./pages/no_modules";

const PageWrapper = () => {
	const {pathname} = useLocation();
	const target = pathname.split("/").pop();

	return (
		<>
			<h1>wasm-bindgen-spawn Example (target: {target})</h1>
			<div style={{padding: "2em"}}>
				<p>
					Cross-Origin Isolation Enabled: {`${globalThis.crossOriginIsolated}`}
				</p>
				<div style={{display: "flex", gap: "2em", flexDirection: "column"}}>
					<Outlet/>
				</div>
			</div>
			<p style={{color: "#888"}}>Open the console to see the output</p>
		</>
	);
};

function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route element={<PageWrapper/>}>
					<Route path={'/no-modules'} element={<NoModulesExample/>}/>
					<Route path={'/web'} element={<WebExample/>}/>
					<Route path={'*'} element={<Navigate to="/no-modules"/>}/>
				</Route>
			</Routes>
		</BrowserRouter>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App/>
	</StrictMode>,
);
