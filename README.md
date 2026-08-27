# DAN STUDIO — PROMPT_ENGINE

SaaS generujący prompty do obrazów AI. Pakuje proprietary systemy **N1 / S1 / R1**
w produkt subskrypcyjny dla polskich twórców AI influencer/modeling.

Platforma generuje **prompty**, nie obrazy.

---

## Stack

- **Next.js 15.5** (App Router, React 19, Node 22) — hosting na Vercel
- **Supabase** (Postgres + Auth + RLS) — projekt `BRNS SYSTEM`
- **LLM:** direct OpenAI / xAI; LiteLLM na Railway tylko gdy ustawione `LITELLM_BASE_URL` + `LITELLM_MASTER_KEY`

Pomoc dla usera (publiczna, bez logowania): [`/docs`](app/docs/page.tsx) — jak linear.app/docs, nie tracker.  
Kolejka roboty agentów: [docs/AGENT_BACKLOG.md](docs/AGENT_BACKLOG.md).  
UX: [docs/UX_NOTES.md](docs/UX_NOTES.md). Review: [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md).

---

## Setup lokalny

```bash
npm install
cp .env.example .env.local   # uzupełnij wartości
npm run build                # ZAWSZE przed deployem
npm run dev
```

**Zasada:** `npm run build` musi przejść lokalnie przed jakimkolwiek deployem.
Trzy nieudane buildy na Vercelu (2026-08-20) wynikały z pomijania tego kroku.

---

## Struktura

```
app/
  api/
    generate/route.ts              # główny endpoint generacji
    me/route.ts                    # sesja, admin flag, starter credits
    health/route.ts                # czy env doszedł (bez sekretów)
    systems/route.ts               # lista publiczna (BEZ system_prompt)
    prompts/  folders/  ratings/   # biblioteka usera
    webhooks/mor/route.ts          # stub doładowań (T02 — utwardzić)
    admin/                         # systems, users, credits, ban, cost
  login/  terms/  page.tsx
components/PromptEngine.tsx        # konsola MVP
lib/
  supabase-admin.ts                # leniwy singleton service_role
  auth.ts                          # requireUser / requireAdmin
  credits.ts  llm.ts  models.ts
  pricing.ts                       # PLACEHOLDER USD — MYS-34
  rate-limit.ts
docs/AGENT_BACKLOG.md              # taski dla kolejnych agentów
docs/CODE_REVIEW.md
```

---

## Zasady architektoniczne — nienaruszalne

1. **`system_prompt` nigdy nie opuszcza backendu.**
   Czytany wyłącznie przez `service_role`. Klient korzysta z widoku
   `systems_public`, który fizycznie nie ma tej kolumny. To główne IP produktu.

2. **Kredyty rezerwowane atomowo PRZED wywołaniem modelu.**
   `reserve_credits()` RPC — pojedynczy UPDATE z warunkiem `balance >= cost`.
   Nigdy read-modify-write (race condition). Przy błędzie modelu: `refund_credits()`.

3. **Whitelist modeli po stronie serwera.**
   `modelOverride` z requestu bez walidacji = user pali twój klucz droższym modelem.

4. **Wszystkie route'y API są `force-dynamic`.**
   Zależą od nagłówka `Authorization` i env vars w runtime — nigdy prerenderowane.

5. **Nigdy nie logować pełnych obiektów błędu z fetcha.**
   Mogą zawierać nagłówek `Authorization`. Tylko `err.message` i status.

---

## Baza — migracje

Wdrożone i zweryfikowane na żywej bazie (2026-08-20):

| Migracja | Zakres |
|---|---|
| `mys35_lock_system_prompt` | zdjęta policy z `systems`, widok `systems_public` |
| `mys37_atomic_credit_functions` | `reserve_credits` / `refund_credits` |
| `mys41_missing_rls_and_policies` | RLS na `system_variants`, `consent_log` |
| `mys41_signup_trigger` | `handle_new_user` — tworzy `profiles` + `credits` |
| `mys41_touch_updated_at` | triggery `updated_at` |
| `mys39_cost_tracking_columns` | tokeny + `cost_usd` w `credit_transactions` |
| `mys39_cost_views` | `admin_cost_daily`, `admin_cost_by_user` |
| `mys38_credit_pricing` | `credits_per_block`: R1=1, S1=2, N1=2 |

---

## Model rozliczeń

**Managed prepaid** — nasz klucz API, user kupuje kredyty.

Koszt kredytowy = `blockCount × credits_per_block × mnożnik_długości`
(short ×1, std ×1.5, long ×2; R1 zawsze ×1).

⚠️ **`lib/pricing.ts` zawiera ceny PLACEHOLDER.** Zweryfikować w cenniku
OpenAI/xAI przed produkcją. Kalibracja realna: **MYS-34** (20 generacji) —
bloker przed ustaleniem cennika.

---

## Znane braki

- Konsola MVP jest na `dev` (`components/PromptEngine.tsx`). Prototyp
  `prompt_engine_v3.jsx` ma instrukcje systemów w kodzie — **nie wraca na produkcję**.
  Brakuje polishu (MYS-43), nie samego ekranu.
- MoR / płatności (MYS-23, MYS-24) — webhook jest stubem; nie włączaj checkoutu
  zanim T02 z backlogu nie będzie merżone
- Kalibracja realnego cennika USD (MYS-34) — 20 generacji w adminie
- BYOK — świadomie odłożone (MYS-44)

Tracking: Linear, projekt `brns-agnet-8c0035d243de`, prefiks `MYS-*`.
Kolejne PR-y agentów: [docs/AGENT_BACKLOG.md](docs/AGENT_BACKLOG.md).
