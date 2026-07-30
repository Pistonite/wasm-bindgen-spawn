import * as esbuild from "esbuild";
import { inlinePlugin } from './inline.plugin.mjs';

await esbuild.build({
	entryPoints: [
		"src/ts/no_modules/index.ts"
	],
	bundle: true,
	splitting: false,
	treeShaking: true,
	minify: true,
	format: "iife",
	globalName: "__wbgSpawn",
	footer: {
		js: "return __wbgSpawn.default.apply(null, args);",
	},
	platform: "browser",
	outfile: "./src/ts/dist/createDispatcher.no_modules.min.js",
	plugins: [
		inlinePlugin({
			format:"esm",
			platform: "browser",
			raw: true
		})
	],
	loader: {
		".ts": "ts"
	}
});
