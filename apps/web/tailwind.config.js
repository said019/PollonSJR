/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─── Pollón SJR — "Ember & Smoke" Dark Theme ─────────
        primary: "#F97316",
        "primary-dim": "#EA580C",
        "primary-container": "#C2410C",
        "primary-fixed": "#FB923C",
        "primary-fixed-dim": "#EA580C",
        "on-primary": "#431407",
        "on-primary-container": "#FED7AA",
        "on-primary-fixed": "#000000",
        "on-primary-fixed-variant": "#7C2D12",
        "inverse-primary": "#9A3412",

        secondary: "#FACC15",
        "secondary-dim": "#EAB308",
        "secondary-container": "#854D0E",
        "secondary-fixed": "#FDE047",
        "secondary-fixed-dim": "#FACC15",
        "on-secondary": "#713F12",
        "on-secondary-container": "#FEF9C3",
        "on-secondary-fixed": "#422006",
        "on-secondary-fixed-variant": "#854D0E",

        tertiary: "#FFFBEB",
        "tertiary-dim": "#FEF3C7",
        "tertiary-container": "#FDE68A",
        "tertiary-fixed": "#FFFBEB",
        "tertiary-fixed-dim": "#FEF3C7",
        "on-tertiary": "#78716C",
        "on-tertiary-container": "#57534E",
        "on-tertiary-fixed": "#44403C",
        "on-tertiary-fixed-variant": "#57534E",

        error: "#EF4444",
        "error-dim": "#DC2626",
        "error-container": "#991B1B",
        "on-error": "#450A0A",
        "on-error-container": "#FEE2E2",

        surface: "#0C0A09",
        "surface-dim": "#0C0A09",
        "surface-bright": "#292524",
        "surface-variant": "#1C1917",
        "surface-tint": "#F97316",
        "surface-container-lowest": "#000000",
        "surface-container-low": "#0F0D0C",
        "surface-container": "#171412",
        "surface-container-high": "#1C1917",
        "surface-container-highest": "#292524",
        "on-surface": "#FFFBEB",
        "on-surface-variant": "#A8A29E",
        "inverse-surface": "#FAFAF9",
        "inverse-on-surface": "#44403C",

        background: "#0C0A09",
        "on-background": "#FFFBEB",

        outline: "#78716C",
        "outline-variant": "#44403C",

        // ─── Legacy aliases ──────────────────────────────────
        pollon: {
          primary: "#F97316",
          secondary: "#FACC15",
          dark: "#0C0A09",
          light: "#FFFBEB",
          accent: "#EA580C",
        },
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
      fontFamily: {
        headline: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        body: ["Outfit", "system-ui", "sans-serif"],
        label: ["Outfit", "system-ui", "sans-serif"],
        sans: ["Outfit", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "fade-in": "fade-in 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};
