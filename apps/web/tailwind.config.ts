import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF2FF',
          100: '#E6ECFF',
          500: '#3A66FF',
          600: '#2A4ECC',
          700: '#1F3A99',
        },
        ink: {
          900: '#1F1F1F',
          700: '#444444',
          500: '#8E92A6',
          300: '#B6C2E5',
          100: '#ECEEF3',
        },
        bg: {
          DEFAULT: '#F7F8FA',
          card: '#FFFFFF',
        },
        accent: {
          red: '#FF4D4F',
          yellow: '#FAAD14',
          green: '#52C41A',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Source Han Sans CN',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 4px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
