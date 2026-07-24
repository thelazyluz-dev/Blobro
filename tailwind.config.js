/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#1A0B2E',
        goo: '#A3FF12',
        hot: '#FF2E88',
        pop: '#FFD84D',
        cy: '#00E5FF',
        bone: '#FFF4E0',
      },
      fontFamily: {
        display: ['"Suez One"', 'serif'],
        body: ['Rubik', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
