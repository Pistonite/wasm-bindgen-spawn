import {defineConfig} from '@rsbuild/core';
import * as path from 'node:path';

export default defineConfig({
	source: {
		entry: {
			dispatcher: "./src/ts/dispatcher.ts",
			['dispatcher.worker']: "./src/ts/dispatcher.worker.ts",
		},
	},
	output: {
		distPath: {
			root: './src/ts/dist',
			js: '.',
		},
		assetPrefix: 'a',
		filename: {
			js: '[name].js',
		},
	},
	tools: {
		htmlPlugin: false,
		rspack(config) {
			config.module.rules.push({
				test: /\.worker\.ts$/,
				use: [
					{
						loader: path.resolve("inline-ts-loader.cjs"),
					},
				],
			});

			config.module.rules.push({
				test: /dispatcher\.ts$/,
				use: [
					{
						loader: path.resolve("inline-ts-loader.cjs"),
					},
				],
			});

			config.output = {
				iife: true,
			};
			config.optimization = {
				runtimeChunk: false,
				splitChunks: false,
			}
		},
	},
});
