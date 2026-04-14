/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Base palette — deep navy backgrounds
        navy: {
          950: '#060818',
          900: '#0a0f2e',
          800: '#0f1642',
          700: '#161e55',
        },
        // Per-game accent colours
        'game-sudoku':    '#6366f1', // indigo
        'game-queens':    '#ec4899', // pink
        'game-zip':       '#f59e0b', // amber
        'game-tango':     '#f97316', // orange
        'game-nonogram':  '#14b8a6', // teal
        'game-minesweeper': '#ef4444', // red
        'game-kakuro':    '#a855f7', // purple
        'game-lightup':   '#eab308', // yellow
        'game-futoshiki': '#22c55e', // green
        'game-hitori':    '#64748b', // slate
        // Semantic
        surface: '#111827',
        'surface-2': '#1f2937',
        'surface-3': '#374151',
        border: '#374151',
        'border-subtle': '#1f2937',
        muted: '#6b7280',
        'text-primary': '#f9fafb',
        'text-secondary': '#9ca3af',
      },
      fontFamily: {
        sans: ['SpaceGrotesk-Regular'],
        'sans-medium': ['SpaceGrotesk-Medium'],
        'sans-bold': ['SpaceGrotesk-Bold'],
        mono: ['JetBrainsMono-Regular'],
      },
    },
  },
  plugins: [],
};
