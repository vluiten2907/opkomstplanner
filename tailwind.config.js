/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: { extend: {
    colors: { accent: 'var(--accent)', ink: 'var(--ink)', muted: 'var(--muted)', surface: 'var(--surface)', line: 'var(--line)' },
    fontFamily: { display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'], sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'] },
  } },
  plugins: [],
};
