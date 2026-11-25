/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {
    fontFamily: { sans: ["Manrope", "sans-serif"], mono: ["DM Mono", "monospace"] },
    colors: { ink: "#090b10", panel: "#11151d", line: "#252c38", muted: "#929bab", accent: "#a3e635" },
    boxShadow: { glow: "0 0 50px rgba(163,230,53,.10)" }
  }},
  plugins: []
}