const { transform } = require("@swc/core");

module.exports = function (source) {
	const callback = this.async();

	transform(source, {
		filename: this.resourcePath,
		jsc: {
			parser: {
				syntax: "typescript",
			},
		},
		module: {
			type: "commonjs",
		},
	})
		.then(result => {
			callback(
				null,
				`module.exports = ${JSON.stringify(result.code)}`
			);
		})
		.catch(callback);
};
