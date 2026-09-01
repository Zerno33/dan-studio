"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ref");
    if (q?.trim()) localStorage.setItem("brns_ref", q.trim().toLowerCase());

    let unsub: { unsubscribe: () => void } | undefined;
    (async () => {
      const supabase = await getSupabaseBrowser();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      });
      unsub = data.subscription;
    })();
    return () => unsub?.unsubscribe();
  }, []);

  async function signIn(mode: "in" | "up") {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (!consent) throw new Error("Zaznacz checkbox zgody pod hasłem.");
      if (!email.trim() || !password) throw new Error("Wpisz email i hasło.");
      const supabase = await getSupabaseBrowser();
      const ref = typeof window !== "undefined" ? localStorage.getItem("brns_ref") : null;
      if (mode === "up") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            ...(ref ? { data: { referred_by: ref } } : {}),
            emailRedirectTo: ref
              ? `${window.location.origin}/login?ref=${encodeURIComponent(ref)}`
              : `${window.location.origin}/login`,
          },
        });
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
      window.location.href = ref ? `/?ref=${encodeURIComponent(ref)}` : "/";
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
      const ref = typeof window !== "undefined" ? localStorage.getItem("brns_ref") : null;
      const dest = ref
        ? `${window.location.origin}/?ref=${encodeURIComponent(ref)}`
        : `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: dest },
      });
      if (error) setError(polishAuthError(error.message));
    } catch (e: any) {
      setError(polishAuthError(e.message || "Google niedostępne."));
    }
  }

  async function sendReset() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (!email.trim()) throw new Error("Wpisz email, potem kliknij reset.");
      const supabase = await getSupabaseBrowser();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (err) throw err;
      setInfo("Jeśli konto istnieje — mail z linkiem (sprawdź spam).");
    } catch (e: any) {
      setError(polishAuthError(e.message || "Nie wysłano resetu."));
    } finally {
      setBusy(false);
    }
  }

  async function saveNewPassword() {
    setBusy(true);
    setError("");
    try {
      if (!password || password.length < 6) throw new Error("Hasło min. 6 znaków.");
      const supabase = await getSupabaseBrowser();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      window.location.href = "/";
    } catch (e: any) {
      setError(polishAuthError(e.message || "Nie zapisano hasła."));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
        <h1 style={{ color: "#E5152A" }}>NOWE HASŁO</h1>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="nowe hasło" style={field} />
        {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
        <button disabled={busy} onClick={saveNewPassword} style={btn}>
          Zapisz
        </button>
      </main>
    );
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
      <button type="button" disabled={busy} onClick={sendReset} style={{ ...btn, background: "transparent", color: "#8A8A8A", marginTop: 12, padding: 0 }}>
        Nie pamiętam hasła
      </button>
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
