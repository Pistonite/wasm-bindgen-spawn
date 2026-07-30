import { defineConfig } from '@rsbuild/core';
import * as path from 'node:path';

export default defineConfig({
	source: {
		entry: {
			dispatcher: './src/ts/index.ts',
		},
	},
	output: {
		target: 'web',
		distPath: {
			root: './src/',
			js: './src/ts/dist',
		},
		assetPrefix: 'a',
		filename: {
			js: '[name].js',
		},
	},
	tools: {
		htmlPlugin: false,
		rspack: {
			module: {
				rules: [
					{
						resourceQuery: /inline/,
						use: [
							path.resolve(
								'inline-ts-loader.cjs'
							),
						],
					},
				],
			},

			output: {
				iife: true,
			},
		},
	},
});
