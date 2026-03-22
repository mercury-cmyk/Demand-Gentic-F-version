import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      transitionTimingFunction: {
        sidebar: "cubic-bezier(0.2,0,0,1)",
        material: "cubic-bezier(0.4,0,0.2,1)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / )",
        foreground: "hsl(var(--foreground) / )",
        border: "hsl(var(--border) / )",
        input: "hsl(var(--input) / )",
        card: {
          DEFAULT: "hsl(var(--card) / )",
          foreground: "hsl(var(--card-foreground) / )",
          border: "hsl(var(--card-border) / )",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / )",
          foreground: "hsl(var(--popover-foreground) / )",
          border: "hsl(var(--popover-border) / )",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / )",
          foreground: "hsl(var(--primary-foreground) / )",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / )",
          foreground: "hsl(var(--secondary-foreground) / )",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / )",
          foreground: "hsl(var(--muted-foreground) / )",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / )",
          foreground: "hsl(var(--accent-foreground) / )",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / )",
          foreground: "hsl(var(--destructive-foreground) / )",
          border: "var(--destructive-border)",
        },
        success: "hsl(var(--success) / )",
        warning: "hsl(var(--warning) / )",
        info: "hsl(var(--info) / )",
        "teal-accent": "hsl(var(--teal-accent) / )",
        ring: "hsl(var(--ring) / )",
        chart: {
          "1": "hsl(var(--chart-1) / )",
          "2": "hsl(var(--chart-2) / )",
          "3": "hsl(var(--chart-3) / )",
          "4": "hsl(var(--chart-4) / )",
          "5": "hsl(var(--chart-5) / )",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / )",
          DEFAULT: "hsl(var(--sidebar) / )",
          foreground: "hsl(var(--sidebar-foreground) / )",
          border: "hsl(var(--sidebar-border) / )",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / )",
          foreground: "hsl(var(--sidebar-primary-foreground) / )",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / )",
          foreground: "hsl(var(--sidebar-accent-foreground) / )",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "spin-slow": "spin-slow 8s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;