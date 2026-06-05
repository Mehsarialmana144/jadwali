/** @type {import('tailwindcss').Config} */
export default {
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
          DEFAULT: '#fafaf9',
          card:    '#ffffff',
          border:  '#e8e5e0',
        },
        ink: {
          DEFAULT: '#1c1917',
          muted:   '#78716c',
          faint:   '#a8a29e',
        },
      },
    },
  },
  plugins: [],
}
