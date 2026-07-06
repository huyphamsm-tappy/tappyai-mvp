import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Ordered breakpoints incl. xs(480) + 3xl(1920)/4xl(2560) per docs/UI_GUIDELINES.md §3.
    // sm/md/lg/xl/2xl keep Tailwind's exact default values — existing utilities regenerate identically.
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      '4xl': '2560px',
    },
    extend: {
      // Semantic container max-widths (docs/UI_GUIDELINES.md §4). Additive; nothing uses them yet.
      maxWidth: {
        'container-compact': '28rem', // 448px
        'container-content': '48rem', // 768px
        'container-wide': '64rem',    // 1024px
        'container-feed': '80rem',    // 1280px
        'container-full': '96rem',    // 1536px
      },
      // Fluid clamp() type scale (docs/UI_GUIDELINES.md §5). Additive; existing text-* untouched.
      fontSize: {
        'fluid-display': ['clamp(1.75rem, 4vw, 2.75rem)', { lineHeight: '1.1' }],
        'fluid-h1': ['clamp(1.5rem, 3vw, 2rem)', { lineHeight: '1.2' }],
        'fluid-h2': ['clamp(1.25rem, 2.2vw, 1.5rem)', { lineHeight: '1.25' }],
        'fluid-h3': ['clamp(1.05rem, 1.6vw, 1.25rem)', { lineHeight: '1.3' }],
        'fluid-body': ['clamp(1rem, 1.2vw, 1.125rem)', { lineHeight: '1.6' }],
      },
      colors: {
        primary: { DEFAULT: '#007AFF', 50: '#E5F1FF', 100: '#CCE3FF', 200: '#99C8FF', 300: '#66ACFF', 400: '#3391FF', 500: '#007AFF', 600: '#0062CC', 700: '#004999', 800: '#003166', 900: '#001833' },
        accent: { DEFAULT: '#FF9500', 50: '#FFF4E5', 100: '#FFE9CC', 200: '#FFD399', 300: '#FFBD66', 400: '#FFA733', 500: '#FF9500', 600: '#CC7700', 700: '#995900', 800: '#663C00', 900: '#331E00' }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      animation: { 'fade-in': 'fadeIn 0.2s ease-in-out', 'slide-up': 'slideUp 0.3s ease-out', 'pulse-dot': 'pulseDot 1.4s ease-in-out infinite', 'shake': 'shake 0.4s ease-in-out', 'heart-pop': 'heartPop 0.7s ease-out forwards' },
      keyframes: { fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } }, slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } }, pulseDot: { '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' }, '40%': { transform: 'scale(1)', opacity: '1' } }, shake: { '0%, 100%': { transform: 'translateX(0)' }, '20%': { transform: 'translateX(-6px)' }, '40%': { transform: 'translateX(6px)' }, '60%': { transform: 'translateX(-4px)' }, '80%': { transform: 'translateX(4px)' } }, heartPop: { '0%': { transform: 'scale(0.8)', opacity: '0' }, '20%': { transform: 'scale(1.3)', opacity: '1' }, '45%': { transform: 'scale(1)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '0' } } }
    }
  },
  plugins: []
}
export default config
