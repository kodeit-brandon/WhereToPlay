/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mint: {
          50: '#e9f9f8',
          100: '#ccf1ef',
          400: '#3fcfca',
          500: '#2ac1bc',
          600: '#1fa8a3',
          700: '#178581',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0, 0, 0, 0.06)',
        nav: '0 -2px 12px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
