/** Detect LLM policy refusals that must not be saved as prompts. */

export function isModelRefusal(raw: string): boolean {
  const t = raw
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;

  const hits = [
    "can't assist",
    "cannot assist",
    "unable to assist",
    "can't help with",
    "cannot help with",
    "can't help you",
    "cannot help you",
    "i can't help",
    "i cannot help",
    "not able to help",
    "won't be able to help",
    "i can't fulfill",
    "i cannot fulfill",
    "against my guidelines",
    "violat",
    "i must refuse",
    "i have to refuse",
  ];
  if (hits.some((h) => t.includes(h))) return true;

  const sorry = /^(i('m| am) sorry|sorry[,.])/i.test(t);
  return sorry && t.length < 280;
}
