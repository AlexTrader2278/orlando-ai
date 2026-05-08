/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#eef0f4",
        ink: "#1c2436",
        soft: "#ffffff",
        muted: "#6b7488",
        accent: "#2563eb",
        accentInk: "#1e3a8a",
      },
      boxShadow: {
        neu: "8px 8px 24px #c8ccd6, -8px -8px 24px #ffffff",
        neuSm: "4px 4px 12px #c8ccd6, -4px -4px 12px #ffffff",
        neuInset: "inset 5px 5px 12px #c8ccd6, inset -5px -5px 12px #ffffff",
        neuInsetSm: "inset 3px 3px 8px #c8ccd6, inset -3px -3px 8px #ffffff",
      },
    },
  },
  plugins: [],
};
