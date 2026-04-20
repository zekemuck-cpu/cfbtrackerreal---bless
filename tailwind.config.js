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
          'faded': 'var(--team-primary-faded)',
          'muted': 'var(--team-primary-muted)',
          'subtle': 'var(--team-primary-subtle)',
        },
        // Dark theme surface colors (slight blue-black undertone)
        'surface': {
          '0': 'var(--surface-0, #09090d)',
          '1': 'var(--surface-1, #0f1013)',
          '2': 'var(--surface-2, #16171c)',
          '3': 'var(--surface-3, #1e1f25)',
          '4': 'var(--surface-4, #2a2b32)',
          '5': 'var(--surface-5, #3a3b44)',
        },
        // Semantic text colors
        'txt': {
          'primary': 'var(--text-primary, #f5f5f7)',
          'secondary': 'var(--text-secondary, #a8a8b0)',
          'tertiary': 'var(--text-tertiary, #6e6e78)',
          'muted': 'var(--text-muted, #4a4a52)',
        },
        // Semantic accents
        'success': 'var(--accent-success)',
        'warning': 'var(--accent-warning)',
        'danger': 'var(--accent-error)',
        'info': 'var(--accent-info)',
      },
      fontFamily: {
        'display': ['Outfit', 'system-ui', 'sans-serif'],
        'body': ['DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['var(--text-display-xl)', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '900' }],
        'display-lg': ['var(--text-display-lg)', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-md': ['var(--text-display-md)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'stat-hero': ['var(--text-stat-hero)', { lineHeight: '0.95', letterSpacing: '-0.04em', fontWeight: '900' }],
        'stat-lg': ['var(--text-stat-lg)', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '800' }],
        'stat-md': ['var(--text-stat-md)', { lineHeight: '1.2', fontWeight: '600' }],
      },
      borderRadius: {
        'sm': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'dark-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'dark-md': '0 4px 6px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 15px rgba(0, 0, 0, 0.5)',
        'dark-xl': '0 20px 25px rgba(0, 0, 0, 0.6)',
        'glow': '0 0 20px var(--team-primary-muted)',
      },
      zIndex: {
        'header': '40',
        'sidebar': '50',
        'dropdown': '100',
        'modal': '9999',
        'confirm': '10000',
        'toast': '10001',
      },
    },
  },
  plugins: [],
}
