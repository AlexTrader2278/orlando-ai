import { tg } from "../lib/telegram";

// Запуск: npm run tg-setup -- https://orlando-ai.vercel.app/api/telegram
// Ставит webhook (только после деплоя роута!) и список команд бота.
async function main() {
  const url = process.argv[2];
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!url?.startsWith("https://")) throw new Error("Передай https-адрес вебхука первым аргументом");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");

  await tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
  await tg("setMyCommands", {
    commands: [
      { command: "menu", description: "Открыть меню" },
      { command: "start", description: "Начать" },
    ],
  });

  await tg("setMyShortDescription", {
    short_description: "Личный AI-механик Chevrolet Orlando: ответы по опыту владельцев, диагностика, сервисная книжка.",
  });
  await tg("setMyDescription", {
    description: [
      "Личный механик для Chevrolet Orlando 1.8 (F18D4, АКПП 6T40).",
      "",
      "• Отвечает по опыту владельцев — 65 000 обсуждений из чата сообщества",
      "• Помнит твою машину: что и когда менял, на каком пробеге",
      "• Разбирает симптом: вероятные причины, светофор срочности, что проверить самому",
      "• Слушает звук мотора — пришли голосовое",
      "• Ведёт сервисную книжку: запись, правка, выгрузка",
      "",
      "Это помощник-триаж, а не вердикт мастера.",
    ].join("\n"),
  });

  const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
  console.log("webhook:", info.url);
  console.log("в очереди:", info.pending_update_count, "| последняя ошибка:", info.last_error_message ?? "нет");
}

main().catch((e) => {
  console.error("Ошибка:", (e as Error).message);
  process.exit(1);
});
