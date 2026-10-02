import { tg } from "../lib/telegram";
import type { TgUpdate } from "../lib/bot";

// Локальный «мост»: забирает апдейты у Telegram (getUpdates) и отдаёт их локальному роуту так,
// будто это webhook. Нужен для проверки бота на настоящих кнопках до выкладки на Vercel.
// Запуск: npm run tg-poll   (webhook при этом не должен быть установлен)
async function main() {
  const target = process.argv[2] ?? "http://localhost:3005/api/telegram";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");

  const info = await tg<{ url: string }>("getWebhookInfo");
  if (info.url) {
    throw new Error(`У бота установлен webhook (${info.url}) — getUpdates с ним не работает. Мост нужен только для локальных проверок.`);
  }

  console.log("мост запущен →", target);
  let offset = 0;
  for (;;) {
    let updates: (TgUpdate & { update_id: number })[];
    try {
      updates = await tg("getUpdates", { offset, timeout: 20, allowed_updates: ["message", "callback_query"] });
    } catch (e) {
      console.error("getUpdates:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
          body: JSON.stringify(u),
        });
        console.log(new Date().toLocaleTimeString("ru-RU"), "update", u.update_id, "→", res.status);
      } catch (e) {
        console.error("forward:", (e as Error).message);
      }
    }
  }
}

main().catch((e) => {
  console.error("Ошибка:", (e as Error).message);
  process.exit(1);
});
