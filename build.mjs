import * as esbuild from "esbuild";
import {inlinePlugin} from './inline.plugin.mjs';

const isWeb = process.argv.includes('--web');
const target = isWeb ? 'web' : 'no_modules';

await esbuild.build({
	entryPoints: [
		`src/ts/${target}/index.ts`
	],
	bundle: true,
	splitting: false,
	treeShaking: true,
	minify: true,
	format: "iife",
	platform: isWeb ? "browser" : undefined,
	globalName: "__wbgSpawn",
	footer: {
		js: "return __wbgSpawn.default.apply(null, args);",
	},
	outfile: `./src/ts/dist/createDispatcher.${target}.min.js`,
	plugins: [
		inlinePlugin({
			format: "esm",
			platform: "browser",
			raw: !isWeb
		})
	],
	loader: {
		".ts": "ts"
	}
});
