import * as esbuild from "esbuild";
import { inlinePlugin } from './inline.plugin.mjs';


await esbuild.build({
	entryPoints: [
		"src/ts/web/index.ts"
	],
	bundle: true,
	splitting: false,
	treeShaking: true,
	minify: true,
	format: "iife",
	platform: "browser",
	globalName: "__wbgSpawn",
	footer: {
		js: "return __wbgSpawn.default.apply(null, args);",
	},
	outfile: "./src/ts/dist/createDispatcher.web.min.js",
	plugins: [
		inlinePlugin({
			format: "esm",
			platform: "browser"
		})
	],
	loader: {
		".ts": "ts"
	}
});
