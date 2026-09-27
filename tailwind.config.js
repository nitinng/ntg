/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      fontSize: {
        // Graduated scale-down: smallest steps (2xs/xs) are kept at their
        // original size since they're already near the legibility floor
        // (badges, captions, labels). Reduction grows toward the larger
        // steps, where the "feels too big" impression mostly comes from.
        // Do NOT replace this with a flat html{font-size:%} root scale —
        // that shrinks 2xs/xs below ~11px and makes them unreadable.
        '2xs': ['0.6875rem', { lineHeight: '1.4' }],  // 11px (unchanged)
        'xs': ['0.75rem', { lineHeight: '1.4' }],      // 12px (unchanged)
        'sm': ['0.8125rem', { lineHeight: '1.4' }],    // 13px (was 14px)
        'base': ['0.9375rem', { lineHeight: '1.5' }],  // 15px (was 16px)
        'lg': ['1.0625rem', { lineHeight: '1.5' }],    // 17px (was 18px)
        'xl': ['1.125rem', { lineHeight: '1.3' }],     // 18px (was 20px)
        '2xl': ['1.375rem', { lineHeight: '1.2' }],    // 22px (was 24px)
        '3xl': ['1.6875rem', { lineHeight: '1.2' }],   // 27px (was 30px)
        '4xl': ['2rem', { lineHeight: '1.2' }],        // 32px (was 36px)
        '5xl': ['2.625rem', { lineHeight: '1.2' }],    // 42px (was 48px)
      },
      colors: {
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        indigo: {
          50: '#f5f7ff',
          100: '#ebf0fe',
          200: '#ced9fd',
          300: '#a1b6fb',
          400: '#6d8bf7',
          500: '#4361ee',
          600: '#3a4fd4',
          700: '#2f3faf',
          800: '#26328c',
          900: '#202971',
          950: '#131843',
        },
      },
    },
  },
  plugins: [],
}
