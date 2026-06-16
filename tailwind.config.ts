import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        imsg: {
          blue: "#0b93f6",
          gray: "#e5e5ea",
          dark: "#1c1c1e",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
