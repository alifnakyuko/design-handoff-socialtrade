import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#14140F',
        'brand-gold': '#FFC627',
        'brand-gold-dark': '#8A6400',
        'brand-cream': '#FBFAF5',
        'brand-cream-dark': '#ECE7D6',
        'brand-muted': '#5E5A4C',
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
