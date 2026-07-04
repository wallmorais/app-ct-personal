/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta tematizável: os valores vêm de variáveis CSS (definidas em
        // index.css) que trocam entre claro e escuro. Os tripletos RGB
        // permitem usar modificadores de opacidade do Tailwind (ex.: bg-base-card/95).
        base: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          card: 'rgb(var(--color-card) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          muted: 'rgb(var(--color-muted) / <alpha-value>)',
          fg: 'rgb(var(--color-fg) / <alpha-value>)',
          // Overlay de hover/active: branco no escuro, preto no claro.
          hover: 'rgb(var(--color-hover) / <alpha-value>)',
        },
        // Acento da marca (teal). Tematizado para manter contraste legível no
        // tema claro sem perder a identidade no escuro.
        emerald: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
        },
        electric: {
          DEFAULT: '#0E8589',
        },
        brand: {
          DEFAULT: '#15A9AD',
          dark: '#0E8589',
          light: '#3CCBCF',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
