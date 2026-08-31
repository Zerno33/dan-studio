# Smoke test preview

URL: `https://….vercel.app` (nie panel `vercel.com`). Health: `/api/health`.

`litellm: false` jest OK — używamy OpenAI/xAI bezpośrednio.

## Checklist (Mati)

| # | Test | OK? |
|---|------|-----|
| 1 | `/api/health` — supabase* + openai albo xai = true | ☐ |
| 2 | `/login` — email + checkbox zgody | ☐ |
| 3 | Konsola — systemy z API (brak instrukcji w DevTools → Sources) | ☐ |
| 4 | Generuj — sukces albo czytelny 402/502 | ☐ |
| 5 | Saldo zmienia się tylko z `creditsRemaining` | ☐ |
| 6 | Karta: kopiuj, folder, ocena; BIBLIOTEKA → USUŃ | ☐ |
| 7 | Nauczyciel: KOD REF → KOPIUJ LINK → incognito → rejestracja → lista poleconych | ☐ |
| 8 | ADMIN → ZAPROŚ MAILEM (brzydki mail = OK bez SMTP) | ☐ |
| 9 | Grok: N1 ze zdjęciem — albo wynik, albo komunikat „użyj GPT”; S1/R1 tekstowo | ☐ |

## Admin (konto z `is_admin` / `ADMIN_EMAILS`)

Instrukcja z API, kredyty, KOD REF, KOSZT → GROK VS GPT, kalibracja.

## SQL (Supabase, raz)

1a–1d z `docs/sql/` — już na BRNS. Opcjonalnie `docs/sql/mor_grant_credits.sql` przed webhookiem płatności.
