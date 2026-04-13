/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5', // Indigo-600
          light: '#EEF2FF',   // Indigo-50
          dark: '#3730A3',    // Indigo-800
        },
        secondary: {
          DEFAULT: '#06B6D4', // Teal-500
          light: '#ECFEFF',   // Teal-50
          dark: '#0E7490',    // Teal-700
        },
        neutral: {
          light: '#F8FAFC',   // Slate-50
          surface: '#FFFFFF',
          text: '#0F172A',    // Slate-900
          muted: '#64748B',   // Slate-500
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
