# Jak pracujemy (Mati = PM, agent = dev)

Nie musisz rozumieć kodu. Ty klikasz w panelach i decydujesz produkt. Ja piszę kod, recenzuję Twoje branche i tłumaczę błędy na konkretne kliki.

**Nigdy nie wklejaj kluczy API na czat, na Slacku ani do Gita.** Tylko w Vercel → Environment Variables.

Zespół agentów (kolejka tasków + prompty do wklejenia): [AGENT_BACKLOG.md](./AGENT_BACKLOG.md).  
Code review `dev`: [CODE_REVIEW.md](./CODE_REVIEW.md).

W Cloud Agents **Base branch = `dev`**. Jeden agent = jeden task z backlogu = PR do `dev`. Ty mergujesz na `main` dopiero jak klikniesz i działa.

---

## Rytm branchy (vibe-code)

1. Robisz eksperyment na **osobnym branchu** (np. `mati/ui-konsola`).
2. Push na GitHub + krótka wiadomość: „review brancha X”.
3. Ja czytam diff. Fajne rzeczy **przepisuję** na czysto do głównej linii.
4. Nie mergujemy prototypu, jeśli ma instrukcje N1/S1/R1 w JS albo klucze na froncie.

Szablon opisu PR: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

---

## Krok 1 — klucz OpenAI (albo xAI)

Potrzebujemy go, żeby przycisk **Generuj** nie zwracał błędu modelu.

### OpenAI (wystarczy na start)

1. Wejdź na [https://platform.openai.com](https://platform.openai.com) i zaloguj się.
2. Jeśli prosi o kartę — dodaj. To nie jest opłata z góry; płacisz za zużycie.
3. **Limit wydatków (ważne):** Settings → Billing → Limits. Ustaw np. **20 USD / miesiąc**. Dzięki temu pomyłka nie spali budżetu.
4. API keys → **Create new secret key**. Nazwa np. `brns-prompt-engine`.
5. Skopiuj klucz (zaczyna się od `sk-`). Pokaże się **raz**.
6. Wklej go tylko w Vercel jako `OPENAI_API_KEY` (krok 2).

xAI (Grok) jest opcjonalny: analogicznie klucz w panelu x.ai → zmienna `XAI_API_KEY`.

Jak skończysz, napisz na czacie: **„klucz wrzucony na Vercel”** — bez treści klucza.

---

## Krok 2 — zmienne na Vercel (Supabase + klucz)

### Skąd wziąć dane Supabase

1. [https://supabase.com/dashboard](https://supabase.com/dashboard) → projekt **BRNS SYSTEM**.
2. **Project Settings** (koło zębate) → **API**.
3. **Project URL** → to jest `SUPABASE_URL` i to samo jako `NEXT_PUBLIC_SUPABASE_URL`.
4. **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (może być w przeglądarce).
5. **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (jak hasło do całej bazy — tylko Vercel, nigdy front).

### Gdzie wkleić na Vercel

1. [https://vercel.com](https://vercel.com) → projekt `dan-studio` (albo Import z GitHub, jeśli jeszcze nie ma).
2. **Settings** → **Environment Variables**.
3. Dodaj każdą parę nazwa / wartość. Zaznacz **Production** i **Preview**.
4. Lista obowiązkowa:

| Nazwa | Co to jest po ludzku |
|---|---|
| `SUPABASE_URL` | Adres bazy |
| `SUPABASE_SERVICE_ROLE_KEY` | Tajny klucz serwera |
| `NEXT_PUBLIC_SUPABASE_URL` | Ten sam adres co URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publiczny klucz logowania |
| `OPENAI_API_KEY` | Silnik Generuj |

5. Po zapisaniu: **Deployments** → trzy kropki na ostatnim → **Redeploy** (inaczej stary deploy nie widzi nowych haseł).

---

## Krok 3 — link preview

1. Vercel → zakładka **Deployments**.
2. Kliknij najnowszy, który jest zielony.
3. Skopiuj URL (końcówka typu `*.vercel.app`).
4. Wyślij mi ten link. Ja sprawdzam logowanie i Generuj.

Szybki test „czy hasła doszły” (nie pokazuje sekretów):  
`https://TWOJA-DOMENA/api/health`

Chcesz widzieć same `true` przy `supabaseUrl`, `supabaseService`, `anonKey`, `openai` (albo `xai`).

---

## Krok 4 — Google (można pominąć na start)

Email + hasło działa bez Google.

Jeśli chcesz przycisk Google: Supabase → **Authentication** → **Providers** → Google.  
W **Redirect URLs** dodaj `https://TWOJA-DOMENA/` (ten z Vercel).

---

## Krok 5 — 20 generacji i cennik (MYS-34)

Pierwsze wejście na konsolę przy saldzie 0 dodaje **50 kredytów startowych** (raz).  
Żeby widzieć **admin**: na Vercel ustaw `ADMIN_EMAILS=twoj@mail.com` i Redeploy.

1. N1 → PROMPT → wklej krótki tekst → Generuj.
2. Mix N1/S1/R1 do ~20 strzałów.
3. Admin → Kalibracja (ostatnie 20).
4. **Ty** mówisz ceny planów w zł.

---

## Krok 6 — beta

Zapraszasz ludzi. Kredyty na start: admin → użytkownik → Kredyty.  
Płatności (Polar) dopiero jak będzie firma / VAT.

---

## Co napisać agentowi

- „Klucz i env na Vercel, preview: https://…”
- „Zrób review brancha `nazwa`”
- „Krok 1 nie działa, utknąłem na ekranie X” (+ screenshot bez kluczy)
