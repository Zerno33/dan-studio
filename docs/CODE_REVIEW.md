# Code review — `origin/dev` @ `4ff8a05`

Data: 2026-08-27. Recenzent: Cloud Agent (tech lead).
Zakres: cała apka na `dev` (API, `lib/`, konsola, login, admin), nie sam diff vs `main`.

Werdykt: **MVP da się klikać, nie jest gotowe na betę z obcymi userami.**
Happy path `/api/generate` trzyma rezerwację kredytów i whitelistę modeli.
Największe dziury: **pierwszy signup = admin**, **webhook dopisuje 100 kredytów by default**, **rate limit nie liczy nieudanych calli LLM** (koszt providera).

---

## Co już jest dobrze

- Konsola (`components/PromptEngine.tsx`) + `/login` + `/terms` — to nie jest już puste preview (README kłamał, że MYS-43 nie istnieje).
- User nie dostaje `system_prompt` z `/api/systems` (`systems_public`).
- Generate: `reserve_credits` przed modelem, refund gdy LLM padnie albo parse jest pusty.
- Whitelist `ALLOWED_MODEL_SET` na generate.
- Wszystkie 19 route'ów API mają `force-dynamic`.
- Logi generate nie dumpują pełnego obiektu fetch.
- Build `npm run build` przechodzi (Next 15.5.23). `npm ci` na tym commicie **nie** — lockfile rozjechany.

---

## Critical

### C1. Pierwszy user bez adminów zostaje adminem

`app/api/me/route.ts` — gdy `profiles` nie ma `is_admin=true`, każdy pierwszy authenticated GET `/api/me` dostaje `is_admin`.

```ts
bootstrapFirstAdmin = (count ?? 0) === 0;
if ((makeAdmin || bootstrapFirstAdmin) && !profile?.is_admin)
  profilePatch.is_admin = true;
```

Admin widzi i edytuje `system_prompt` (IP), listę userów, kredyty, bany.
Race dwóch signupów: obaj mogą wygrać okno „zero adminów”.

**Fix:** tylko `ADMIN_EMAILS`. Zero automatycznego bootstrapu.

### C2. Webhook MoR — default 100 kredytów, brak idempotencji

`app/api/webhooks/mor/route.ts`:

- `product_id` (string) → `Number(...)` = `NaN` → fallback **100**.
- Brak filtra typu eventu (`order.paid` vs refund vs test).
- Replay tego samego eventu = podwójne kredyty.
- SELECT balance + upsert (last-write-wins).

**Fix:** fail closed gdy nie ma jawnej kwoty; mapa produkt→kredyty; klucz idempotencji; RPC `grant_credits`.

### C3. Po udanym LLM błąd DB = kredyty zjedzone, brak promptów

`app/api/generate/route.ts` po sukcesie modelu robi `credit_transactions.insert` i `prompts.insert` **bez** obsługi błędu i **bez** refundu.

**Fix:** try/catch po LLM; jeśli zapis się wywali — `refund_credits` + 500.

### C4. Rate limit liczy tylko udane generacje

`lib/rate-limit.ts` patrzy na `credit_transactions.reason = "generation"`.
Ten wiersz powstaje dopiero po sukcesie. Fail LLM → refund → licznik 0.
Atakujący może walić w model bez limitu requestów (kredyty wracają, rachunek OpenAI/xAI nie).

**Fix:** liczyć próbę w momencie reserve (osobna tabela albo wiersz `generation_attempt`).

---

## High

| ID | Problem | Gdzie |
|---|---|---|
| H1 | Checkbox regulaminu jest kosmetyką: `/api/me` sam ustawia `consent_at`. `consent_log` nigdy nie zapisywany. | `app/api/me/route.ts`, login |
| H2 | Granty kredytów poza generate: read-modify-write (admin, webhook, starter). Łamie invariant #2. | admin credits, webhook, `/api/me` |
| H3 | User płaci za N bloków, model może zwrócić 1 (fallback `parseBlocks` na cały raw). Brak partial refund. | `generate/route.ts` |
| H4 | Admin POST/PATCH systemu przyjmie dowolny `model` — generate potem 400 „Niedozwolony model”. | `admin/systems` |
| H5 | Generate: N1 bez `mode` przechodzi walidację; S1 bez limitu liczby zdjęć; `brief`/`pastedPrompt` bez max length (koszt tokenów >> kredyty). | `generate/route.ts` |
| H6 | Refund RPC bez sprawdzenia wyniku — cichy ubytek salda. | `generate/route.ts` |

---

## Medium

| ID | Problem |
|---|---|
| M1 | Admin API zwraca `system_prompt` do przeglądarki (OK dla operatora, katastrofa jeśli C1). |
| M2 | `/api/systems` fallback na tabelę `systems` gdy widok padnie. |
| M3 | `/api/health` publicznie mówi, które sekrety są ustawione. |
| M4 | `PATCH /api/prompts/[id]` nie sprawdza, czy `folderId` należy do usera. |
| M5 | Ban blokuje tylko generate; biblioteka i `/api/me` działają. |
| M6 | `usage` (tokeny) wraca do każdego usera w JSON generate. |
| M7 | `tsconfig`: `strict: false`. Zero testów. Brak ESLint. |
| M8 | Brak `middleware.ts` — flash konsoli przed redirectem na `/login`. |
| M9 | `package-lock.json` nie zgadza się z `package.json` (`npm ci` pada). |

---

## Low (nie blokują bety, ale zespół agentów powinien wiedzieć)

- Malformed JSON → 500 zamiast 400.
- Porównanie sekretu webhooka nie timing-safe.
- `lib/pricing.ts` placeholdery (MYS-34).
- Starter credits: możliwy duplikat transakcji `reason=starter`.
- Admin credits: brak min/max, ujemne `amount` schodzi poniżej 0.
- UI: mieszanka PL/EN, brak labeli, admin to `JSON.stringify` + `window.prompt`.
- README: Next 14 vs 15; „brak frontu”; LiteLLM „do rozstrzygnięcia”.

---

## Invarianty README vs kod

| # | Zasada | Generate (user) | Reszta |
|---|---|---|---|
| 1 | `system_prompt` nie wychodzi | OK | Admin UI łamie świadomie |
| 2 | Atomowe kredyty przed LLM | OK | Admin / webhook / starter: RMW |
| 3 | Whitelist modeli | OK | Admin może zapisać zły model |
| 4 | `force-dynamic` | OK | OK |
| 5 | Nie logować pełnych błędów fetch | OK | OK |

---

## Nie ruszaj w tym PR-ze

Ten dokument jest recenzją. Naprawy = osobne taski w `AGENT_BACKLOG.md` (jeden agent = jeden PR).
