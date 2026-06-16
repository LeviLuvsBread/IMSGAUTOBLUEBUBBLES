import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        canvas: {
          DEFAULT: "rgb(var(--canvas) / <alpha-value>)",
          alt: "rgb(var(--canvas-alt) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          "2": "rgb(var(--surface-2) / <alpha-value>)",
        },
        label: {
          DEFAULT: "rgb(var(--label) / <alpha-value>)",
          secondary: "rgb(var(--label-secondary) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          cta: "rgb(var(--accent-cta) / <alpha-value>)",
        },
        link: "rgb(var(--link) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        hairline: "rgb(var(--separator-opaque) / <alpha-value>)",
        sysgray: "rgb(var(--sysgray) / <alpha-value>)",
        "bubble-received": "rgb(var(--bubble-received) / <alpha-value>)",
        fill: {
          DEFAULT: "var(--fill)",
          secondary: "var(--fill-secondary)",
          tertiary: "var(--fill-tertiary)",
          quaternary: "var(--fill-quaternary)",
        },
        separator: "var(--separator)",
        // Existing imsg.* keeps working; blue now resolves to systemBlue (auto light/dark).
        imsg: {
          blue: "rgb(var(--accent) / <alpha-value>)",
          gray: "#e5e5ea",
          dark: "#1c1c1e",
        },
      },
      fontSize: {
        caption2: ["11px", { lineHeight: "1.18", letterSpacing: "0.006em", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "1.3333", letterSpacing: "-0.01em" }],
        footnote: ["13px", { lineHeight: "1.3846", letterSpacing: "-0.01em" }],
        reduced: ["14px", { lineHeight: "1.4286", letterSpacing: "-0.016em" }],
        subhead: ["15px", { lineHeight: "1.3333", letterSpacing: "-0.016em" }],
        callout: ["16px", { lineHeight: "1.3125", letterSpacing: "-0.02em" }],
        body: ["17px", { lineHeight: "1.4706", letterSpacing: "-0.022em" }],
        title3: ["20px", { lineHeight: "1.25", letterSpacing: "0.01em", fontWeight: "600" }],
        h5: ["24px", { lineHeight: "1.1667", letterSpacing: "0.009em", fontWeight: "600" }],
        h4: ["28px", { lineHeight: "1.1429", letterSpacing: "0.007em", fontWeight: "600" }],
        h3: ["32px", { lineHeight: "1.125", letterSpacing: "0.002em", fontWeight: "600" }],
        h2: ["40px", { lineHeight: "1.1", letterSpacing: "0em", fontWeight: "600" }],
        h1: ["48px", { lineHeight: "1.0835", letterSpacing: "-0.002em", fontWeight: "600" }],
        hero: ["56px", { lineHeight: "1.0714", letterSpacing: "-0.005em", fontWeight: "600" }],
      },
      borderRadius: {
        control: "8px",
        row: "10px",
        card: "16px",
        "card-lg": "22px",
        sheet: "28px",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      maxWidth: { content: "980px" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)",
        elevated: "0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
        overlay: "0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
        switch: "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)",
      },
      transitionTimingFunction: {
        ios: "cubic-bezier(0,0,0.58,1)",
        "ios-emphasized": "cubic-bezier(0.16,1,0.3,1)",
      },
      transitionDuration: { fast: "150ms", base: "250ms", medium: "300ms", large: "400ms" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in .25s cubic-bezier(0,0,0.58,1) both",
        "scale-in": "scale-in .25s cubic-bezier(0.16,1,0.3,1) both",
        "slide-up": "slide-up .3s cubic-bezier(0,0,0.58,1) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
