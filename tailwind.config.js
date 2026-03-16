/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  safelist: [
    /* Dynamic bar colours */
    'bg-red-500', 'bg-yellow-400', 'bg-green-400',
    /* Server card borders */
    'border-green-400', 'border-red-400', 'border-yellow-400',
    /* Status badges */
    'bg-green-100', 'text-green-700',
    'bg-red-100',   'text-red-600',
    'bg-yellow-100','text-yellow-700',
    /* AI recommendation button */
    'border-red-300',   'text-red-500',   'bg-red-50',
    'border-yellow-300','text-yellow-600','bg-yellow-50',
  ],
  theme: {
    extend: {
      colors: {
        accent:     '#EC861D',
        dark:       '#1F2937',
        secondary:  '#2563EB',
        surface:    '#F8FAFC',
        muted:      '#64748B',
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

