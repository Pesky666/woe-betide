export const RESERVED_ORDER = [
  "player_a",
  "player_b",
  "rat",
  "bramble",
  "derek",
  "moon",
  "keith",
  "mushroom",
  "clerk",
  "enemy",
] as const;

export type SpriteRecord = {
  schema: 3;
  layout: "dbq-extensible";
  order: string[];
  frames: number[][];
  checksum: string;
  updated: string;
};

export function checksum(value: unknown) {
  let hash = 2166136261;
  const input = JSON.stringify(value);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validateSpriteRecord(value: unknown):
  | { ok: true; record: SpriteRecord }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Invalid sprite record." };
  const record = value as Partial<SpriteRecord>;
  if (record.schema !== 3 || record.layout !== "dbq-extensible") return { ok: false, error: "Unsupported sprite format." };
  if (!Array.isArray(record.order) || !Array.isArray(record.frames)) return { ok: false, error: "Missing sprite table." };
  if (record.order.length < RESERVED_ORDER.length || record.order.length > 128) return { ok: false, error: "Sprite table must contain 10–128 entries." };
  if (record.frames.length !== record.order.length) return { ok: false, error: "Sprite names and frames do not match." };
  if (!RESERVED_ORDER.every((name, index) => record.order?.[index] === name)) return { ok: false, error: "Reserved slots 1–10 cannot move." };
  if (new Set(record.order).size !== record.order.length) return { ok: false, error: "Every sprite needs a unique name." };
  if (!record.order.every((name) => /^[a-z][a-z0-9_]{1,31}$/.test(name))) return { ok: false, error: "Sprite names must be lowercase IDs." };
  if (!record.frames.every((frame) => Array.isArray(frame) && frame.length === 256 && frame.every((pixel) => pixel === 0 || pixel === 1))) return { ok: false, error: "Every sprite must be a 16×16 one-bit frame." };
  if (record.checksum !== checksum({ order: record.order, frames: record.frames })) return { ok: false, error: "Sprite checksum failed." };
  return { ok: true, record: record as SpriteRecord };
}
