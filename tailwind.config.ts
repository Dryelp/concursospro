import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B14',
          900: '#0D1220',
          850: '#131929',
          800: '#1A2236',
        },
        atlas: {
          400: '#4F8EF7',
          500: '#2D6FE0',
          violet: '#A78BFA',
          green: '#4FF7A0',
          yellow: '#F7C94F',
          red: '#F75F4F',
        },
      },
      boxShadow: {
        panel: '0 4px 24px rgba(0,0,0,.4)',
        glow: '0 0 40px rgba(79,142,247,.25)',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'sans-serif'],
        display: ['var(--font-space)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
