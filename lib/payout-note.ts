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
