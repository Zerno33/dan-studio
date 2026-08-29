# Mail z logowania — nie idzie z Gita

Supabase wysyła maile sam. Kod w repo **nie zmieni** tego, dopóki nie wkleisz szablonu w panelu.

1. Wejdź na [supabase.com](https://supabase.com) → projekt **BRNS**.
2. **Authentication** → **Email Templates**.
3. Dla **Confirm signup** wklej HTML z pliku `docs/emails/confirm-signup.html`.
4. Dla **Magic Link** (jeśli włączony) — `docs/emails/magic-link.html`.
5. **Save**. Wyślij test: nowa rejestracja.

W szablonach zostaw `{{ .ConfirmationURL }}` — to przycisk od Supabase. Nie ruszaj.
