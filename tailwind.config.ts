import type { Config } from 'tailwindcss';

const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { bg: v('bg'), panel: v('panel'), line: v('line'), fg: v('fg'), muted: v('muted'), accent: v('accent'), 'accent-fg': v('accent-fg'), good: v('good'), warn: v('warn'), bad: v('bad') },
    },
  },
  plugins: [],
};
export default config;
