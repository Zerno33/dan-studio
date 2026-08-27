"use client";

import { useState, type CSSProperties } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

function polishAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Zły email lub hasło.";
  if (m.includes("email not confirmed")) return "Potwierdź email — sprawdź skrzynkę (i spam).";
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "To konto już istnieje. Zaznacz zgodę i kliknij Zaloguj.";
  }
  if (m.includes("password")) return "Hasło za krótkie (min. 6 znaków) albo odrzucone przez serwer.";
  return message;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(mode: "in" | "up") {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (!consent) throw new Error("Zaznacz checkbox zgody pod hasłem.");
      if (!email.trim() || !password) throw new Error("Wpisz email i hasło.");
      const supabase = await getSupabaseBrowser();
      if (mode === "up") {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        if (!data.session) {
          setInfo("Konto utworzone. Jeśli Supabase wymaga potwierdzenia — otwórz maila, potem wróć i kliknij Zaloguj.");
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      }
      window.location.href = "/";
    } catch (e: any) {
      setError(polishAuthError(e.message || "Błąd logowania."));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!consent) {
      setError("Zaznacz checkbox zgody pod hasłem.");
      return;
    }
    try {
      const supabase = await getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) setError(polishAuthError(error.message));
    } catch (e: any) {
      setError(polishAuthError(e.message || "Google niedostępne."));
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1 style={{ color: "#E5152A" }}>PROMPT_ENGINE</h1>
      <p>Zaloguj się, żeby korzystać z konsoli.</p>
      <p style={{ fontSize: 14 }}>
        <a href="/docs">Jak to działa</a> — krótka pomoc, bez logowania.
      </p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" style={field} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="hasło" style={field} />
      <label style={{ display: "flex", gap: 8, margin: "12px 0", fontSize: 13 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Potwierdzam prawa do wrzucanych materiałów i akceptuję{" "}
        <a href="/terms">Terms of Use</a>.
      </label>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      {info && <p style={{ color: "#9f9" }}>{info}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={() => signIn("in")} style={btn}>
          Zaloguj
        </button>
        <button disabled={busy} onClick={() => signIn("up")} style={btn}>
          Rejestracja
        </button>
        <button disabled={busy} onClick={google} style={btn}>
          Google
        </button>
      </div>
    </main>
  );
}

const field: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 8,
  background: "#141414",
  color: "#ededed",
  border: "1px solid #333",
  borderRadius: 8,
  padding: 10,
};
const btn: CSSProperties = {
  background: "#E5152A",
  color: "#fff",
  border: "none",
  padding: "10px 14px",
  borderRadius: 8,
};
