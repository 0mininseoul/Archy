import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0f172a", // Slate 900 (Black)
          light: "#1e3a5f",   // Deep Blue
          dark: "#0a1929",    // Dark Navy
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#f1f5f9", // Slate 100
          foreground: "#0f172a", // Slate 900
        },
        accent: {
          DEFAULT: "#3b82f6", // Blue 500
          foreground: "#ffffff",
        },
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(to right, #0f172a, #1e3a5f)", // Black to Deep Blue
        "gradient-glow": "radial-gradient(circle at center, rgba(30, 58, 95, 0.15) 0%, transparent 70%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
  ],
};

export default config;
