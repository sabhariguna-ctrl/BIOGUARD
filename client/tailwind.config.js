const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), raised: v('raised'), line: v('line'),
        ink: v('ink'), mute: v('mute'),
        face: v('face'), keys: v('keys'), warn: v('warn'), bad: v('bad'), good: v('good'),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
      },
      boxShadow: { lift: '0 18px 40px -22px rgb(var(--shadow) / 0.55)' },
    },
  },
  plugins: [],
};
