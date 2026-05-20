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
        // Выпуклые элементы (карточки, выпуклые кнопки): тёмная тень сильнее, blur больше
        neu: "10px 10px 28px #b0b6c6, -10px -10px 28px #ffffff",
        neuSm: "5px 5px 14px #aab0c0, -5px -5px 14px #ffffff",
        // Утопленные элементы (textarea, input, превью): тёмная тень глубже + spread,
        // светлая тень светлее для контраста — теперь visibly «продавлено»
        neuInset: "inset 7px 7px 16px #9aa3b5, inset -7px -7px 16px #ffffff",
        neuInsetSm: "inset 5px 5px 11px #9aa3b5, inset -5px -5px 11px #ffffff",
      },
    },
  },
  plugins: [],
};
