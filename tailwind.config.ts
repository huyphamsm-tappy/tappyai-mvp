import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#007AFF', 50: '#E5F1FF', 100: '#CCE3FF', 200: '#99C8FF', 300: '#66ACFF', 400: '#3391FF', 500: '#007AFF', 600: '#0062CC', 700: '#004999', 800: '#003166', 900: '#001833' },
        accent: { DEFAULT: '#FF9500', 50: '#FFF4E5', 100: '#FFE9CC', 200: '#FFD399', 300: '#FFBD66', 400: '#FFA733', 500: '#FF9500', 600: '#CC7700', 700: '#995900', 800: '#663C00', 900: '#331E00' }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: { 'fade-in': 'fadeIn 0.2s ease-in-out', 'slide-up': 'slideUp 0.3s ease-out', 'pulse-dot': 'pulseDot 1.4s ease-in-out infinite' },
      keyframes: { fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } }, slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } }, pulseDot: { '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' }, '40%': { transform: 'scale(1)', opacity: '1' } } }
    }
  },
  plugins: []
}
export default config
