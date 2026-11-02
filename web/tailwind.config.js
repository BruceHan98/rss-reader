/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Songti SC', 'Noto Serif CJK SC', 'serif'],
      },
      colors: {
        // Neutral reading surfaces with a single blue navigation accent
        background: '#F7F8FA',
        foreground: '#242424',
        primary: {
          DEFAULT: '#3478F6',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#986B32',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#EAF2FF',
          foreground: '#555B64',
        },
        muted: {
          DEFAULT: '#F2F4F7',
          foreground: '#717784',
        },
        border: '#E8EBF0',
        destructive: '#A85448',
      },
      borderRadius: {
        'organic': '1.25rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(36, 36, 36, 0.08)',
        'float': '0 10px 40px -10px rgba(36, 36, 36, 0.12)',
        'soft-lg': '0 20px 40px -10px rgba(36, 36, 36, 0.1)',
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
