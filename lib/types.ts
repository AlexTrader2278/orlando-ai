export type RawReaction = {
  type: string;
  count: number;
  emoji?: string;
  recent?: { from: string; from_id: string; date: string }[];
};

export type RawMessage = {
  id: number;
  type: "message" | "service";
  date: string;
  date_unixtime: string;
  edited?: string;
  from?: string;
  from_id?: string;
  reply_to_message_id?: number;
  forwarded_from?: string;
  text: string | unknown[];
  text_entities?: { type: string; text: string }[];
  reactions?: RawReaction[];
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
  poll?: unknown;
  action?: string;
};

export type NormalizedMessage = {
  id: number;
  date: string;
  ts: number;
  author: string;
  authorId: string;
  text: string;
  replyTo: number | null;
  reactionsTotal: number;
  reactionsByEmoji: Record<string, number>;
  hasMedia: boolean;
};

export type ServicePart = {
  name: string;                // "масляный фильтр", "масло 5W-30"
  brand?: string | null;       // "Mann", "Mobil 1"
  article?: string | null;     // "W914", "GM 25193400"
  qty?: number | null;         // 1, 4
  unit?: string | null;        // "шт", "л", "кг"
  price?: number | null;       // ₽
  notes?: string | null;
};

export type Thread = {
  id: string;
  rootId: number;
  startDate: string;
  endDate: string;
  messageCount: number;
  participantsCount: number;
  reactionsTotal: number;
  text: string;
  messages: NormalizedMessage[];
};
