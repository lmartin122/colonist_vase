/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Resource palette (original art direction, not official Catan colors)
        wood: '#3f7d4e',
        brick: '#c1543a',
        sheep: '#8fca5c',
        wheat: '#e6b84f',
        ore: '#7f8b9c',
        desert: '#d9c9a3',
        ocean: '#2a6f97',
      },
    },
  },
  plugins: [],
};
