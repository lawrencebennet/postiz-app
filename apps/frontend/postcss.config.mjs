/** @type {import('postcss-load-config').Config} */
// Neptive: the theme plugin maps upstream brand colours to Neptive variables (neptive/brand/postcss)
import neptiveTheme from '../../neptive/brand/postcss/neptive-theme.cjs';

const config = {
  plugins: ['tailwindcss', neptiveTheme],
};

export default config;
