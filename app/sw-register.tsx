"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Если появилась новая версия — мягко обновим
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated" && navigator.serviceWorker.controller) {
              // Контроллер уже работает — новая версия будет применена при следующем заходе.
            }
          });
        });
      } catch (e) {
        // Не критично — фронт продолжит работать без офлайн-кэша
        console.warn("SW registration failed:", e);
      }
    };

    void register();
  }, []);

  return null;
}
