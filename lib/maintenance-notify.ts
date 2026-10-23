import { getServiceRecords } from "./car";
import { computePlan, pickReminders, type ItemResult } from "./maintenance-plan";
import { mdDigest } from "./maintenance-md";
import { getLatestOdometer, getReminderLog, upsertReminderLog } from "./maintenance-store";
import { sendRich } from "./tgrich";
import type { ReplyMarkup, InlineButton } from "./telegram";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function digestKeyboard(items: ItemResult[]): ReplyMarkup {
  const rows: InlineButton[][] = items.map((r) => [
    { text: `✓ Делал: ${r.item.short}`, callback_data: `mt:done:${r.item.id}` },
    { text: "⏰ +30 дн.", callback_data: `mt:snooze:${r.item.id}` },
  ]);
  rows.push([{ text: "☰ Меню", callback_data: "menu:open" }]);
  return { inline_keyboard: rows };
}

export type ReminderRun = { sent: boolean; items: string[]; text: string | null };

/**
 * Суточная проверка: считает план, выбирает, о чём напомнить (pickReminders), шлёт ОДНО сообщение владельцу.
 * Сначала пишет журнал (если таблицы нет — выходим, не слав: иначе напоминания повторялись бы каждый день),
 * потом отправляет; если отправка упала — откатывает записи, чтобы завтра попытаться снова.
 */
export async function runReminderCheck(dryRun = false): Promise<ReminderRun> {
  const today = todayIso();
  const [records, odometer, log] = await Promise.all([getServiceRecords(500), getLatestOdometer(), getReminderLog()]);
  const { mileage, items } = computePlan(records, today, odometer);

  // Пункт снова «в порядке» (сделали / отложили срок) — сбрасываем журнал, чтобы следующее «скоро» сработало.
  const resets = log
    .filter((row) => row.last_status !== "ok" && items.find((r) => r.item.id === row.item_id)?.status === "ok")
    .map((row) => ({ item_id: row.item_id, last_status: "ok" as const, snoozed_until: null }));

  const picked = pickReminders(items, log, today);
  if (picked.length === 0) {
    if (!dryRun) await upsertReminderLog(resets);
    return { sent: false, items: [], text: null };
  }

  const text = mdDigest(mileage, picked);
  const ids = picked.map((r) => r.item.id);
  if (dryRun) return { sent: false, items: ids, text };

  const owner = Number(process.env.TELEGRAM_OWNER_ID?.trim());
  if (!Number.isInteger(owner) || owner <= 0) throw new Error("TELEGRAM_OWNER_ID is not set");

  const now = new Date().toISOString();
  await upsertReminderLog([
    ...resets,
    ...picked.map((r) => ({ item_id: r.item.id, last_status: r.status as "soon" | "overdue", notified_at: now, snoozed_until: null })),
  ]);
  try {
    await sendRich(owner, text, digestKeyboard(picked));
  } catch (e) {
    await upsertReminderLog(ids.map((id) => ({ item_id: id, last_status: "ok" as const })));
    throw e;
  }
  return { sent: true, items: ids, text };
}
