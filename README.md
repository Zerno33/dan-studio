**PM (klik po kliku, bez IT):** [docs/JAK_PRACUJEMY.md](docs/JAK_PRACUJEMY.md)

---

# DAN STUDIO — PROMPT_ENGINE

SaaS generujący prompty do obrazów AI. Pakuje proprietary systemy **N1 / S1 / R1**
w produkt subskrypcyjny dla polskich twórców AI influencer/modeling.

Platforma generuje **prompty**, nie obrazy.

---

## Jak pracujemy (dev vs main)

Dwie gałęzie, żeby vibecoding nie rozwalał oficjalnej apki.

| Gałąź | Po co | Co tam robisz |
|---|---|---|
| **`dev`** | plac zabaw + wersja do klikania | Cursor, testy, „czy to w ogóle działa” |
| **`main`** | oficjalny system | tylko to, co już zaakceptowałeś |

### Codziennie (vibecoding)

1. W Cursorze **zawsze wybierz branch `dev`**, nigdy `main`.
2. Agent koduje na `dev` (albo na małej gałęzi, która wraca do `dev`).
3. Testujesz na **preview** Vercel (gałąź `dev`) albo lokalnie `npm run dev`.
4. Jak coś jest do kitu — zostaje na `dev`. `main` się nie rusza.

### Gdy wersja przejdzie akceptację

1. GitHub → **Pull requests** → **New pull request**
2. base: **`main`** ← compare: **`dev`**
3. Tytuł np. `Release: to, co zaakceptowaliśmy`
4. **Merge** — dopiero to jest oficjalna apka

Nie klikaj „merge” w drugą stronę i nie commituj prosto na `main`.

### Jednorazowo na GitHubie (ochrona `main`)

Repo → **Settings** → **Branches** → **Add branch ruleset** (albo Branch protection):

- Target: `main`
- **Require a pull request before merging**
- Ewentualnie **Require status checks**: job `build` z workflow `ci`

Wtedy nawet przez pomyłkę nie wepchniesz zmian prosto na produkcję.

### Cursor (Cloud Agents)

W dropdownie gałęzi lista bywa niekompletna — wpisz `dev` w **Search branches**.  
W Dashboard → Cloud Agents → Defaults ustaw **Base branch = `dev`**.

---


## Stack

- **Next.js 14** (App Router) — hosting na Vercel
- **Supabase** (Postgres + Auth + RLS) — projekt `BRNS SYSTEM`
- **LLM:** bezpośrednie OpenAI / xAI (domyślnie). LiteLLM tylko gdy `LITELLM_*` jest w env.

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
    generate/route.ts              # główny endpoint generacji (MYS-16/17/18)
    admin/
      systems/route.ts             # GET lista, POST nowy system
      systems/[id]/route.ts        # PATCH edycja + bump wersji
      users/route.ts               # GET lista userów
      users/[id]/credits/route.ts  # POST ręczne kredyty
      users/[id]/ban/route.ts      # POST ban/unban
      ratings-summary/route.ts     # GET pass rate per system+wersja
      cost-summary/route.ts        # GET koszt/marża (MYS-39)
lib/
  supabase-admin.ts                # leniwy singleton service_role
  auth.ts                          # requireAdmin + walidacja slug
  pricing.ts                        # mapa cen modeli (DO WERYFIKACJI)
  rate-limit.ts                     # limity req/min i rozmiaru obrazów
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
| `mor_grant_credits` | `grant_credits` + unikalne `external_event_id` |

---

## Model rozliczeń

**Managed prepaid** — nasz klucz API, user kupuje kredyty.

Koszt kredytowy = `blockCount × credits_per_block × mnożnik_długości`
(short ×1, std ×1.5, long ×2; R1 zawsze ×1).

⚠️ **`lib/pricing.ts` zawiera ceny PLACEHOLDER.** Zweryfikować w cenniku
OpenAI/xAI przed produkcją. Kalibracja realna: **MYS-34** (20 generacji) —
bloker przed ustaleniem cennika.

---

## Deploy (Vercel)

1. Podłącz repo GitHub.
2. Ustaw zmienne z `.env.example` (minimum: `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `OPENAI_API_KEY` i/lub `XAI_API_KEY`).
3. Lokalnie: `npm run build` musi przejść przed deployem.

Webhook płatności: `POST /api/webhooks/mor` z `MOR_WEBHOOK_SECRET`.

BYOK — świadomie odłożone (MYS-44).

Tracking: Linear, projekt `brns-agnet-8c0035d243de`, prefiks `MYS-*`.
