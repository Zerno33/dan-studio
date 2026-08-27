# Backlog — kolejka na `dev`

Rytm (ustalony z Matim):

1. **Poprawiamy kod** (dziury z review — T01–T03 w tym PR).
2. **Budujemy backlog po kolei** — jeden feature, jeden PR do `dev`.
3. **Testujemy** na preview (Mati klika).
4. **Następny feature.**
5. Jak flow usera działa → **dajemy komuś do klikania** (beta). Nie wcześniej.

Między tym: design i UX widoku **usera** (smaczki, potem nowe ekrany).  
**Tego nie planujemy w Linear** — nie ma jeszcze pomysłów, a widoki i tak przyjdą w trakcie. Zrzut: [UX_NOTES.md](./UX_NOTES.md).

Nie commituj na `main`. Jeden otwarty task na agenta.  
Review: [CODE_REVIEW.md](./CODE_REVIEW.md). Zasady: `.cursor/rules/dan-studio.mdc`.

Nie implementować: BYOK (MYS-44), explicit, Claude-in-prod, sekretów w gitcie.

---

## Kolejka (po tym PR)

| Status | ID | Co | Po co, zanim ktoś obcy klika |
|---|---|---|---|
| w tym PR | T00 | Szyny, CI, review | agenci wiedzą jak pracować |
| w tym PR | T01 | Koniec „pierwszy user = admin” | IP i kredyty nie wyciekają |
| w tym PR | T02 | Webhook bez darmowych 100 | nawet stub nie sypie kasy |
| w tym PR | T03 | Rate limit + refund po padzie zapisu | nie palimy klucza API |
| następny | T07 | Widok usera: loader, ban, koszt przed Generuj | pierwsze smaczki konsoli |
| potem | T04 | Walidacja generate (mode, limity, za mało bloków) | user nie płaci za powietrze |
| potem | T06 | Prawdziwa zgoda na regulamin | checkbox znaczy zgodę |
| potem | T05 | Atomowe granty admin/starter | saldo się zgadza |
| potem | T08 | Polski copy + a11y loginu | beta po polsku |
| potem | T10 | Testy automatyczne | regresja nie wraca |
| luzem | T09 | README vs drzewo plików | docs |
| parked | T11–T15 | Admin UI, Polar checkout, cennik USD, foldery | po betcie / decyzji |

**Beta („daj komuś do klikania”)** — po T07 + Twoim „działa” na preview. T04/T06 warto mieć, nie blokują pierwszego zaufanego klikacza jeśli siedzisz obok.

---

## Role (gdy puszczasz agenta)

Wklejasz prompt **jednego** następnego wiersza z kolejki. Nie trzy naraz — zderzą się na tych samych plikach i trudniej klikać.

---

## T01 — Security: zdejmij bootstrap admina

**Status:** zrobione w tym PR  
**Priorytet:** P0  
**Pliki:** `app/api/me/route.ts`, `lib/auth.ts`, `.env.example`, `docs/JAK_PRACUJEMY.md`

### Prompt

```
Base branch: origin/dev. PR do dev. Task T01 z docs/AGENT_BACKLOG.md.

Problem: w app/api/me/route.ts pierwszy zalogowany user dostaje is_admin, gdy w profiles nie ma żadnego admina (bootstrapFirstAdmin). To wyciek IP (system_prompt w admin UI) i pełna władza nad kredytami.

Zrób:
1. Usuń całą logikę bootstrapFirstAdmin.
2. Admin wyłącznie gdy email jest na liście ADMIN_EMAILS / ADMIN_EMAIL (już jest funkcja adminEmails).
3. requireAdmin w lib/auth.ts musi być spójny z tym samym źródłem prawdy — jeśli profil.is_admin został kiedyś ustawiony przez bootstrap, nadal honoruj is_admin w bazie (nie degraduj istniejących adminów), ale NIE ustawiaj is_admin nowym userom bez matcha email.
4. Zaktualizuj .env.example i docs/JAK_PRACUJEMY.md: bez ADMIN_EMAILS zakładka admin się nie pojawi.
5. npm run build musi przejść.

Nie: BYOK, płatności, refaktor całej konsoli, zmiany generate.
```

**Done gdy:** nowy signup bez maila na liście nie jest adminem; mail z `ADMIN_EMAILS` jest.

---

## T02 — Billing: utwardź webhook MoR

**Status:** zrobione w tym PR (fail closed + idempotencja po event id; atomowy RPC grant = T05)  
**Priorytet:** P0  
**Pliki:** `app/api/webhooks/mor/route.ts`

### Prompt

```
Base branch: origin/dev. PR do dev. Task T02 z docs/AGENT_BACKLOG.md. Review: docs/CODE_REVIEW.md C2.

Problem: webhook MoR (app/api/webhooks/mor/route.ts) przy braku credits w payloadzie daje 100 kredytów; Number(product_id) = NaN; brak filtra typu eventu; brak idempotencji; SELECT+upsert na balance.

Zrób:
1. Fail closed: bez jawnej dodatniej liczby credits w payloadzie → 400, zero grantu. Żadnego default 100.
2. Ignoruj eventy inne niż płatność (allowlista np. order.paid / order_created — udokumentuj założenie w komentarzu). Refundy nie dodają kredytów.
3. Idempotencja: zapisz provider event id (nagłówek albo payload.id). Drugi raz ten sam id → 200 ok, duplicate, bez drugiego grantu. Jeśli trzeba — additive migracja SQL w docs/migrations/ (nie niszcz istniejących tabel; jedna baza na dev i main). Jeśli nie chcesz nowej tabeli, użyj unique (reason, provider_event_id) na credit_transactions.
4. Nie rób read-modify-write. Albo RPC grant_credits (additive SQL), albo pojedynczy UPDATE credits SET balance = balance + n. Transakcja credit_transactions zawsze razem z grantem.
5. Porównanie sekretu: timing-safe (crypto.timingSafeEqual) po znormalizowaniu Bearer.
6. npm run build.

Nie implementuj pełnego Polar checkout UI. Nie ruszaj T01 (me/route) poza wyciągnięciem wspólnego grant helpera.
```

**Done gdy:** payload bez kwoty = 0 kredytów; replay nie dubluje; sekret zły = 401.

---

## T03 — Backend: rate limit + refund po błędzie zapisu

**Status:** zrobione w tym PR  
**Priorytet:** P0  
**Pliki:** `app/api/generate/route.ts`, `lib/rate-limit.ts`

### Prompt

```
Base branch: origin/dev. PR do dev. Task T03 z docs/AGENT_BACKLOG.md. Review: C3 i C4.

Problem A: po udanym LLM insert credit_transactions / prompts nie ma try/catch — user traci kredyty (reserve już zszedł), nie ma promptów.
Problem B: rate limit czyta tylko reason=generation po sukcesie. Fail LLM nie liczy się do limitu → można palić klucz API.

Zrób:
1. Po sukcesie modelu: jeśli insert transakcji albo promptów padnie, wywołaj refund_credits, sprawdź błąd RPC, zwróć 500 po polsku.
2. Sprawdzaj wynik refund_credits też w istniejącym catch LLM. Jeśli refund padnie — zaloguj message (nie cały error object) i zwróć 502 z informacją że saldo mogło nie wrócić (albo kolejkuj retry — prosty log wystarczy w tym PR).
3. Rate limit: licz próbę GENERATE w momencie rezerwacji / przed callem, nie tylko successful generation row. Preferowane: wstawić wiersz credit_transactions reason=generation_attempt (delta 0) albo osobne pole; albo inkrement w pamięci nie — musi przeżyć wiele instancji Vercel. Dokumentuj wybór.
4. Nie zmieniaj wzoru ceny kredytów ani whitelist modeli.
5. npm run build.

Nie: nowe UI, webhook, bootstrap admin.
```

**Done gdy:** sztuczny fail insertu po LLM = refund; 30 faili LLM/min = 429 zanim padnie rachunek providera.

---

## T04 — Backend: walidacja generate + whitelist w adminie

**Priorytet:** P1  
**Pliki:** `app/api/generate/route.ts`, `app/api/admin/systems/route.ts`, `app/api/admin/systems/[id]/route.ts`, `lib/models.ts`  
**Czekaj na merż T03** jeśli oba ruszają `generate/route.ts` — albo bierz T04 dopiero gdy T03 zmerżowany.

### Prompt

```
Base branch: origin/dev (po merżu T03 jeśli generate się zmienił). PR do dev. Task T04. Review: H3 H4 H5 H6 M6.

Zrób:
1. N1: mode obowiązkowe img|prompt. Inaczej 400.
2. Limit obrazów S1 taki sam jak N1 (max 10) + istniejące 5MB/szt i 25MB suma.
3. Max długość brief i pastedPrompt (np. 8k znaków) — 400 gdy dłużej.
4. Jeśli blocks.length < oczekiwany blockCount: partial refund za brakujące bloki ALBO pełny refund i 502 — wybierz jedno, opisz w PR. Fallback parseBlocks „cały raw = 1 blok” nie może zjadać pełnej ceny N1×10.
5. Admin POST/PATCH systems: model musi być w ALLOWED_MODEL_SET, inaczej 400.
6. Pole usage w odpowiedzi generate: tylko gdy user is_admin albo env CALIBRATION_DEBUG=1. Zwykły user nie dostaje tokenów.
7. npm run build.
```

---

## T05 — Billing: atomowe granty (admin + starter)

**Priorytet:** P1  
**Pliki:** `app/api/admin/users/[id]/credits/route.ts`, `app/api/me/route.ts` (tylko starter credits), ewentualnie `lib/credits-grant.ts` z T02  
**Czekaj:** po T01 (me/route) i T02 (helper grantu)

### Prompt

```
Base branch: origin/dev po merżu T01 i T02. PR do dev. Task T05. Review: H2.

Zamień SELECT balance + upsert na atomowy grant:
- admin POST credits
- starter credits w /api/me

Wymagania:
1. Wspólny helper / RPC grant_credits(p_user, p_amount, p_reason, p_idempotency_key).
2. Starter: idempotency per user (reason=starter tylko raz). Żadnego duplikatu transakcji przy równoległych /api/me.
3. Admin amount: integer, max np. 10_000, nie zejść poniżej 0 przy ujemnym (albo zakaż ujemnych w tym PR i dodaj osobny deduct później).
4. Nadal zapis credit_transactions.
5. Nie ruszaj generate reserve/refund.
6. npm run build.
```

---

## T06 — Security: prawdziwa zgoda na regulamin

**Priorytet:** P1  
**Pliki:** `app/api/me/route.ts`, nowy `app/api/consent/route.ts` (jeśli potrzeba), `app/login/page.tsx`, ewentualnie `components/PromptEngine.tsx`  
**Czekaj:** po T01 (ten sam me/route)

### Prompt

```
Base branch: origin/dev po merżu T01. PR do dev. Task T06. Review: H1.

Problem: checkbox na loginie nic nie znaczy — GET /api/me sam wpisuje consent_at.

Zrób:
1. /api/me NIE ustawia consent_at.
2. Zgoda tylko z jawnego POST (np. /api/consent) wywołanego gdy user zaznaczył checkbox na login/signup.
3. Wpis do consent_log (tabela z migracji mys41) — user_id, timestamp, source=login. Jeśli kolumny nie znasz, additive migracja w docs/migrations/ i krótka instrukcja SQL dla Matiego.
4. /api/generate dalej wymaga consent_at — to już jest; upewnij się że działa.
5. Login: bez checkboxa nie wołaj consent endpoint. Teksty po polsku.
6. npm run build. Nie loguj sekretów.
```

---

## T07 — Frontend: auth shell, ban, loading, koszt

**Status:** następny po merżu tego PR  
**Priorytet:** P1 — pierwsze smaczki **widoku usera** (patrz UX_NOTES.md)  
**Pliki:** `components/PromptEngine.tsx`, `app/page.tsx`, nowy `middleware.ts` jeśli robisz redirect  
**Nie ruszaj:** API poza odczytem `isBanned` które już wraca z `/api/me`

### Prompt

```
Base branch: origin/dev. PR do dev. Task T07. Review: M5 M8 + frontend review.

Zrób w konsoli:
1. Stan loading zanim /api/me wróci — nie flashuj pełnej konsoli. 401 → /login (możesz dodać middleware.ts na sesję Supabase; jeśli za duże, wystarczy blocking loader).
2. isBanned z /api/me: pełnoekranowy komunikat po polsku, wyłącz Generuj.
3. Disable Generuj gdy credits < previewCost + jasny komunikat.
4. Client-side limit rozmiaru obrazów (5MB/szt, 25MB suma) zanim pójdzie request.
5. Nie wklejaj system_prompt do bundle. Nie zmieniaj logiki cennika.
6. npm run build.
```

---

## T08 — Frontend: polski copy + a11y loginu i zakładek

**Priorytet:** P2  
**Pliki:** `app/login/page.tsx`, `app/terms/page.tsx`, `components/PromptEngine.tsx` (labelki, taby)  
**Kolizja:** nie równolegle z T07 na `PromptEngine.tsx` — po merżu T07

### Prompt

```
Base branch: origin/dev po merżu T07. PR do dev. Task T08.

Zrób:
1. Taby i tryby po polsku (Konsola, Biblioteka, Admin; krótki/std/długi). Osie ocen: zrozumiałe PL.
2. Login: prawdziwe <label htmlFor>, aria-live na błędach, focus styles.
3. Terms: tytuł po polsku.
4. Nie przebudowuj admin JSON dump — to T11 (parked). Nie ruszaj API.
5. npm run build.
```

---

## T09 — Platform: README vs kod (reszta)

**Priorytet:** P2 (lockfile naprawiony w T00)  
**Pliki:** `README.md` (struktura katalogów vs 19 route'ów), `docs/JAK_PRACUJEMY.md`  
**Nie ruszaj:** kodu aplikacji

### Prompt

```
Base branch: origin/dev. PR do dev. Task T09.

README nadal ma starą listę plików (tylko kilka route'ów). Zsynchronizuj „Struktura” z rzeczywistym drzewem app/ i lib/ na dev. Nie zmieniaj zasad kredytów ani nazw RPC (reserve_credits / refund_credits). Stack (Next 15 / Node 22) i linki do review/backlogu już są — nie cofaj.
```

---

## T10 — QA: pierwsze testy

**Priorytet:** P2  
**Pliki:** nowy folder `tests/` albo `__tests__/`, `package.json` (skrypt test), CI job  
**Czekaj:** po fali 1 (T01–T03), mockuj Supabase

### Prompt

```
Base branch: origin/dev po merżu T01 T02 T03. PR do dev. Task T10.

Dodaj Vitest (lub Node test runner) bez ciężkiego e2e:
1. parse / walidacja generate (N1 bez mode → 400) — wyciągnij czyste funkcje jeśli trzeba, nie odpalaj prawdziwego LLM.
2. Webhook grantAmount: brak credits → reject; replay idempotency jeśli T02 już to ma.
3. Admin bootstrap: me/route nie ustawia is_admin bez ADMIN_EMAILS (mock db).
4. package.json: "test": "..."
5. .github/workflows/ci.yml: po npm ci dodaj npm test, potem npm run build.
6. Żadnych prawdziwych kluczy. Żadnego network do OpenAI.
```

---

## Parked (nie uruchamiaj bez decyzji Matiego)

| ID | Co | Czemu czeka |
|---|---|---|
| T11 | Admin UI zamiast JSON + `window.prompt` | Najpierw T01 (żeby admin nie wyciekł) |
| T12 | Biblioteka: foldery w UI | API już jest; to UX |
| T13 | ESLint + `strict: true` | Duży diff, po T10 |
| T14 | Polar/MoR checkout UI (MYS-23/24) | Po T02 |
| T15 | Cennik USD w `lib/pricing.ts` | MYS-34 = 20 kliknięć Matiego w admin → Kalibracja |
| — | BYOK | MYS-44 zakaz |

---

## Mapa plików (kolejność, nie równoległe fale)

T07 rusza `components/PromptEngine.tsx`. T04 rusza `generate/route.ts` (już poprawiony w T03). T05/T06 ruszają `me/route.ts` (już poprawiony w T01). Nie otwieraj ich jednocześnie.

---

## Definition of Done (każdy PR)

- [ ] Branch z `origin/dev`, PR **do `dev`**
- [ ] W opisie: id taska (T0x) i jak Mati to kliknie
- [ ] `npm run build` zielony
- [ ] Nie ma `system_prompt` w kliencie dla non-admin
- [ ] Nie ma sekretów w diffie
- [ ] Nie ruszasz plików spoza taska bez powodu w PR
