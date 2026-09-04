export function parsePayoutNoteUsd(note: string | null | undefined): number {
  if (!note) return 0;
  const paid = note.match(/paid:([0-9]+(?:\.[0-9]+)?)/i);
  if (paid) return Number(paid[1]) || 0;
  const usd = note.match(/usd:([0-9]+(?:\.[0-9]+)?)/i);
  return usd ? Number(usd[1]) || 0 : 0;
}

export function roundUsd(n: number): number {
  return Number(n.toFixed(2));
}

export function isMissingNoteColumn(message: string | undefined): boolean {
  const m = (message || "").toLowerCase();
  return m.includes("note") && (m.includes("schema cache") || m.includes("column"));
}

export type PayoutStatus = "pending" | "in_transit" | "done";

export function parsePayoutStatus(raw: unknown): PayoutStatus | null {
  const s = String(raw || "");
  if (s === "pending" || s === "in_transit" || s === "done") return s;
  return null;
}
