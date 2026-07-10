/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#e4e8f0",
        ink: "#131a2b",
        soft: "#ffffff",
        muted: "#485470",
        accent: "#1d4ed8",
        accentInk: "#1e3a8a",
      },
      boxShadow: {
        // Выпуклые элементы (карточки, выпуклые кнопки): тёмная тень сильнее, blur больше
        neu: "12px 12px 30px #96a0b8, -12px -12px 30px #ffffff",
        neuSm: "6px 6px 14px #949eb6, -6px -6px 14px #ffffff",
        // Утопленные элементы (textarea, input, превью): тёмная тень глубже + spread,
        // светлая тень светлее для контраста — теперь visibly «продавлено»
        neuInset: "inset 7px 7px 16px #8590aa, inset -7px -7px 16px #ffffff",
        neuInsetSm: "inset 5px 5px 11px #8590aa, inset -5px -5px 11px #ffffff",
      },
    },
  },
  plugins: [],
};
