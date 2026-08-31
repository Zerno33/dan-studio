# Mail z logowania — nie idzie z Gita

Supabase wysyła maile sam. Kod w repo **nie zmieni** tego, dopóki nie wkleisz szablonu w panelu.

Najpierw SMTP: Resend (zweryfikowana domena) → Supabase → Authentication → SMTP Settings → Enable custom SMTP.

- Host: `smtp.resend.com`
- Port: `465`
- User: `resend`
- Hasło: API key Resend (nie wklejaj na czat)

Potem szablony:

1. Wejdź na [supabase.com](https://supabase.com) → projekt **BRNS**.
2. **Authentication** → **Email Templates**.
3. **Confirm signup** — `docs/emails/confirm-signup.html`.
4. **Magic Link** (jeśli włączony) — `docs/emails/magic-link.html`.
5. **Invite user** — `docs/emails/invite-user.html` (ADMIN → ZAPROŚ MAILEM).
6. **Save**. Test: nowa rejestracja albo zaproszenie.

W szablonach zostaw `{{ .ConfirmationURL }}` — to przycisk od Supabase. Nie ruszaj.
