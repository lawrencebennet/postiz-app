// Turbopack/webpack loader: applies the Neptive brand transformation (neptive/brand/transform.cjs) to the
// upstream source files that next.config.js routes here (see with-neptive-brand.mjs for the rule).
const { transform } = require('../transform.cjs');

module.exports = function neptiveBrandLoader(source) {
  return transform(source, this.resourcePath);
};
