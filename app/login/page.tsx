"use client";

import { useState, type CSSProperties } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(mode: "in" | "up") {
    setBusy(true);
    setError("");
    try {
      if (!consent) throw new Error("Wymagana akceptacja regulaminu.");
      const supabase = getSupabaseBrowser();
      const fn =
        mode === "up"
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });
      const { error: authError } = await fn;
      if (authError) throw authError;
      window.location.href = "/";
    } catch (e: any) {
      setError(e.message || "Błąd logowania.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!consent) {
      setError("Wymagana akceptacja regulaminu.");
      return;
    }
    const supabase = getSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1 style={{ color: "#E5152A" }}>PROMPT_ENGINE</h1>
      <p>Zaloguj się, żeby korzystać z konsoli.</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" style={field} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="hasło" style={field} />
      <label style={{ display: "flex", gap: 8, margin: "12px 0", fontSize: 13 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Potwierdzam prawa do wrzucanych materiałów i akceptuję{" "}
        <a href="/terms">Terms of Use</a>.
      </label>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
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
