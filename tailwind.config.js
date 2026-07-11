/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        border: "var(--border)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        accent: "var(--accent)",
        popover: "var(--popover)",
        "neon-green": "var(--neon-green)",
        "neon-purple": "var(--neon-purple)",
        "neon-blue": "var(--neon-blue)",
        teal: "var(--teal)",
        orange: "var(--orange)",
        blue: "var(--blue)",
        purple: "var(--purple)",
        red: "var(--red)",
      },
      fontFamily: {
        display: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
