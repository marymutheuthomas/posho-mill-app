/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mill: {
          bg: '#F1F5F9',      // High-Contrast Background
          surface: '#FFFFFF', // Pure White Surface
          text: '#020617',    // Charcoal Text
          border: '#CBD5E1',  // Slate Border
          primary: '#4F46E5', // Indigo Button
          success: '#10B981', // Emerald Button
          warning: '#F97316', // Orange Alert
        }
      },
      boxShadow: {
        'mill': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'mill-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
