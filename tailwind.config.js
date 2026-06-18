/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          bg: '#0B0F0E',
          surface: '#121816',
          card: '#171F1D',
          border: '#26302D',
          muted: '#8A9A95',
        },
        // Paleta alinhada à logomarca (teal). 'emerald' e 'electric' mantêm os
        // nomes por compatibilidade, mas agora apontam para tons da marca.
        emerald: {
          DEFAULT: '#15A9AD',
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
