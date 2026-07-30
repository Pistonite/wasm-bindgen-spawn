import * as esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";

const inlinePlugin = {
	name: "inline",

	setup(build) {
		build.onResolve({ filter: /\?inline$/ }, args => {
			return {
				path: path.resolve(args.resolveDir, args.path.replace(/\?inline$/, "")),
				namespace: "inline"
			};
		});

		build.onLoad(
			{ filter: /.*/, namespace: "inline" },
			async args => {
				const result = await esbuild.build({
					entryPoints: [args.path],
					bundle: true,
					format: "esm",
					platform: "browser",
					write: false,
					minify: true,
					sourcemap: false,
					loader: {
						".ts": "ts"
					}
				});

				return {
					contents: result.outputFiles[0].text,
					loader: "text"
				};
			}
		);
	}
};


await esbuild.build({
	entryPoints: [
		"src/ts/index.ts"
	],
	bundle: true,
	splitting: false,
	treeShaking: true,
	minify: true,
	format: "iife",
	platform: "browser",
	outfile: "./src/ts/dist/createDispatcher.min.js",
	plugins: [
		inlinePlugin
	],
	loader: {
		".ts": "ts"
	}
});
