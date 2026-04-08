/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FEFDFB',
          100: '#FDF9F3',
          200: '#FAF3E8',
          300: '#F5EADA',
          400: '#EDE0CC',
        },
        sage: {
          50: '#F4F7F4',
          100: '#E3EBE3',
          200: '#C7D7C7',
          300: '#A3BEA3',
          400: '#7DA17D',
          500: '#5C855C',
          600: '#486B48',
          700: '#3B563B',
          800: '#324632',
          900: '#2A3B2A',
        },
        charcoal: {
          50: '#F5F5F5',
          100: '#E5E5E5',
          200: '#CCCCCC',
          300: '#999999',
          400: '#666666',
          500: '#444444',
          600: '#333333',
          700: '#262626',
          800: '#1A1A1A',
          900: '#0D0D0D',
        },
        amber: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'card': '0 2px 8px -2px rgba(0, 0, 0, 0.06), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',
        'elevated': '0 8px 24px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
