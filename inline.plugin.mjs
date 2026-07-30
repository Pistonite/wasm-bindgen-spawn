import path from "node:path";
import * as esbuild from "esbuild";

export function inlinePlugin({
 format,
 platform,
 raw = false
}) {
	return {
		name: "inline",

		setup(build) {

			if (!raw) {
				build.onResolve({filter: /\?inline$/}, args => {
					return {
						path: path.resolve(args.resolveDir, args.path.replace(/\?inline$/, "")),
						namespace: "inline"
					};
				});

				build.onLoad(
					{filter: /.*/, namespace: "inline"},
					async args => {
						const result = await esbuild.build({
							entryPoints: [args.path],
							bundle: true,
							format,
							platform,
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



			if (raw) {
				build.onResolve({filter:/\?inline$/}, args => ({
					path:path.resolve(
						args.resolveDir,
						args.path.replace(/\?inline$/, "")
					),
					namespace:"inline"
				}));

				build.onLoad(
					{filter:/.*/, namespace:"inline"},
					async args => {
						const result = await esbuild.build({
							entryPoints:[args.path],
							bundle:true,
							format,
							platform,
							write:false,
							minify:true,
							sourcemap:false,
							loader:{
								".ts":"ts"
							}
						});

						return {
							contents: `
export default ${JSON.stringify(result.outputFiles[0].text)};
`,
							loader:"js"
						};
					}
				);
			}
		}
	};
}
