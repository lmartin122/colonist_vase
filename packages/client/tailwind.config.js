/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Semantic surface/text colors flip with the theme via CSS variables.
        card: 'rgb(var(--card) / <alpha-value>)',
        'card-alt': 'rgb(var(--card-alt) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        // Player accents: blue / red / green / purple
        'p-blue': '#3B82F6',
        'p-red': '#E4572E',
        'p-green': '#2FA85A',
        'p-purple': '#8B5CF6',
        // Board / terrain
        wood: '#5B9E5E',
        brick: '#CE6A45',
        sheep: '#A7D06A',
        wheat: '#EAC65C',
        ore: '#8B97A6',
        desert: '#E3D6B0',
        ocean: '#2E6E96',
      },
      boxShadow: {
        panel: '0 6px 20px -6px rgba(20, 30, 40, 0.35), 0 2px 6px -2px rgba(20, 30, 40, 0.2)',
        soft: '0 2px 8px -2px rgba(20, 30, 40, 0.25)',
        pop: '0 10px 30px -8px rgba(20, 30, 40, 0.5)',
      },
      borderRadius: {
        xl: '0.85rem',
        '2xl': '1.1rem',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
