/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Lora', 'serif'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a5bafd',
          400: '#8094fb',
          500: '#6171f6',
          600: '#4f52eb',
          700: '#4240d0',
          800: '#3636a8',
          900: '#303285',
          950: '#1e1d50',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          card:    'rgb(var(--surface-card) / <alpha-value>)',
          raised:  'rgb(var(--surface-raised) / <alpha-value>)',
          border:  'rgb(var(--surface-border) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted:   'rgb(var(--ink-muted) / <alpha-value>)',
          faint:   'rgb(var(--ink-faint) / <alpha-value>)',
        },
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
}
