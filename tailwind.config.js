/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'team': {
          'primary': 'var(--team-primary, #ea580c)',
          'secondary': 'var(--team-secondary, #FFFFFF)',
          'tertiary': 'var(--team-tertiary, #fed7aa)',
        },
        // Dark theme surface colors
        'surface': {
          '0': 'var(--surface-0, #0a0a0b)',
          '1': 'var(--surface-1, #111113)',
          '2': 'var(--surface-2, #18181b)',
          '3': 'var(--surface-3, #1f1f23)',
          '4': 'var(--surface-4, #27272a)',
          '5': 'var(--surface-5, #3f3f46)',
        },
        // Semantic text colors
        'txt': {
          'primary': 'var(--text-primary, #fafafa)',
          'secondary': 'var(--text-secondary, #a1a1aa)',
          'tertiary': 'var(--text-tertiary, #71717a)',
          'muted': 'var(--text-muted, #52525b)',
        }
      },
      fontFamily: {
        'display': ['Outfit', 'system-ui', 'sans-serif'],
        'body': ['DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'dark-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'dark-md': '0 4px 6px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 15px rgba(0, 0, 0, 0.5)',
        'dark-xl': '0 20px 25px rgba(0, 0, 0, 0.6)',
        'glow': '0 0 20px var(--team-primary)',
      },
    },
  },
  plugins: [],
}
