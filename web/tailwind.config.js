/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        // Organic design tokens
        background: '#FDFCF8',
        foreground: '#2C2C24',
        primary: {
          DEFAULT: '#5D7052',
          foreground: '#F3F4F1',
        },
        secondary: {
          DEFAULT: '#C18C5D',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#E6DCCD',
          foreground: '#4A4A40',
        },
        muted: {
          DEFAULT: '#F0EBE5',
          foreground: '#78786C',
        },
        border: '#DED8CF',
        destructive: '#A85448',
      },
      borderRadius: {
        'organic': '60% 40% 30% 70% / 60% 30% 70% 40%',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(93, 112, 82, 0.15)',
        'float': '0 10px 40px -10px rgba(193, 140, 93, 0.2)',
        'soft-lg': '0 20px 40px -10px rgba(93, 112, 82, 0.15)',
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
