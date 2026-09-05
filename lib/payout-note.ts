export function parsePayoutNoteUsd(note: string | null | undefined): number {
  if (!note) return 0;
  const paid = note.match(/paid:([0-9]+(?:\.[0-9]+)?)/i);
  if (paid) return Number(paid[1]) || 0;
  const usd = note.match(/usd:([0-9]+(?:\.[0-9]+)?)/i);
  return usd ? Number(usd[1]) || 0 : 0;
}

export function paidNote(usd: number, atIso: string): string {
  return `paid:${roundUsd(usd)} done:${atIso}`;
}

export function parsePaidAt(note?: string | null, completedAt?: string | null): string | null {
  if (completedAt) return completedAt;
  const m = (note || "").match(/done:([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)/i);
  return m?.[1] || null;
}

export function roundUsd(n: number): number {
  return Number(n.toFixed(2));
}

export function isMissingColumn(message: string | undefined, column: string): boolean {
  const m = (message || "").toLowerCase();
  return m.includes(column.toLowerCase()) && (m.includes("schema cache") || m.includes("column") || m.includes("does not exist"));
}

export function isMissingNoteColumn(message: string | undefined): boolean {
  return isMissingColumn(message, "note");
}

export function normalizePayoutStatus(raw: unknown): PayoutStatus {
  const s = String(raw || "").toLowerCase().replace(/-/g, "_");
  if (s === "in_transit" || s === "processing" || s === "w_drodze") return "in_transit";
  if (s === "done" || s === "paid" || s === "completed" || s === "closed") return "done";
  return "pending";
}

export type PayoutStatus = "pending" | "in_transit" | "done";

export function parsePayoutStatus(raw: unknown): PayoutStatus | null {
  const s = String(raw || "");
  if (s === "pending" || s === "in_transit" || s === "done") return s;
  return null;
}
