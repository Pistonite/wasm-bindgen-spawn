const { transform } = require("@swc/core");

module.exports = function (source) {
	const callback = this.async();

	transform(source, {
		filename: this.resourcePath,
		jsc: {
			parser: {
				syntax: "typescript",
			},
			transform: {
				constModules: true,
			},
		},
	})
		.then(result => {
			callback(
				null,
				`export default ${JSON.stringify(result.code)};`
			);
		})
		.catch(callback);
};
