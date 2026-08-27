"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ALLOWED_MODELS } from "@/lib/models";
import { calculateCreditCost } from "@/lib/credits";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Tab = "console" | "library" | "admin";
type PublicSystem = {
  id: string;
  slug: "n1" | "s1" | "r1";
  label: string;
  icon?: string;
  model: string;
  credits_per_block: number;
  desc_user?: string;
  inputs_desc?: string;
  system_variants?: { slug: string; label: string }[];
};

const R1_FALLBACK = [
  { slug: "analyze", label: "ANALYZE" },
  { slug: "repair", label: "REPAIR" },
  { slug: "restyle", label: "RESTYLE" },
  { slug: "angle", label: "ANGLE" },
];

const ERROR_AXES = ["anatomy", "lighting", "identity", "style", "composition"];

async function authFetch(path: string, init: RequestInit = {}) {
  const supabase = await getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function fileToImage(file: File): Promise<{ base64: string; mime: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1] || "";
      resolve({ base64, mime: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

export default function PromptEngine() {
  const [tab, setTab] = useState<Tab>("console");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [systems, setSystems] = useState<PublicSystem[]>([]);
  const [systemSlug, setSystemSlug] = useState<"n1" | "s1" | "r1">("n1");
  const [mode, setMode] = useState<"img" | "prompt">("img");
  const [images, setImages] = useState<{ base64: string; mime: string; preview: string }[]>([]);
  const [pastedPrompt, setPastedPrompt] = useState("");
  const [brief, setBrief] = useState("");
  const [variant, setVariant] = useState("restyle");
  const [count, setCount] = useState(4);
  const [lengthMode, setLengthMode] = useState<"short" | "std" | "long">("std");
  const [modelOverride, setModelOverride] = useState("");
  const [formatMode, setFormatMode] = useState<"together" | "separate">("together");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocks, setBlocks] = useState<{ id?: string; prompt: string; negative: string }[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [adminSystems, setAdminSystems] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [costSummary, setCostSummary] = useState<any>(null);
  const [ratingsSummary, setRatingsSummary] = useState<any>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [editPrompt, setEditPrompt] = useState<Record<string, string>>({});

  const current = systems.find((s) => s.slug === systemSlug);

  const previewCost = useMemo(() => {
    if (!current) return 0;
    return calculateCreditCost(
      { systemSlug, mode, images, variant, count, lengthMode },
      current.credits_per_block
    );
  }, [current, systemSlug, mode, images, variant, count, lengthMode]);

  useEffect(() => {
    (async () => {
      try {
        const me = await authFetch("/api/me");
        setEmail(me.user.email || "");
        setIsAdmin(me.user.isAdmin);
        setCredits(me.credits);
        const sys = await authFetch("/api/systems");
        setSystems(sys.systems || []);
        const fol = await authFetch("/api/folders");
        setFolders(fol.folders || []);
      } catch (e: any) {
        if (String(e.message).includes("401") || String(e.message).includes("autoryz")) {
          window.location.href = "/login";
        }
      }
    })();
  }, []);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const json = await authFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          systemSlug,
          mode: systemSlug === "n1" ? mode : undefined,
          images: images.map(({ base64, mime }) => ({ base64, mime })),
          pastedPrompt,
          brief,
          variant: systemSlug === "r1" ? variant : undefined,
          count: systemSlug === "r1" ? count : undefined,
          lengthMode: systemSlug === "r1" ? undefined : lengthMode,
          modelOverride: modelOverride || undefined,
          formatMode,
        }),
      });
      setBlocks(json.blocks || []);
      if (typeof json.creditsRemaining === "number") setCredits(json.creditsRemaining);
    } catch (e: any) {
      setError(e.message || "Błąd generacji.");
    } finally {
      setBusy(false);
    }
  }

  async function loadLibrary() {
    const json = await authFetch("/api/prompts");
    setLibrary(json.prompts || []);
  }

  async function loadAdmin() {
    const [sys, users, cost, ratings, cal] = await Promise.all([
      authFetch("/api/admin/systems"),
      authFetch("/api/admin/users"),
      authFetch("/api/admin/cost-summary"),
      authFetch("/api/admin/ratings-summary"),
      authFetch("/api/admin/calibration"),
    ]);
    setAdminSystems(sys.systems || []);
    setAdminUsers(users.users || []);
    setCostSummary(cost);
    setRatingsSummary(ratings.summary);
    setCalibration(cal);
    const map: Record<string, string> = {};
    for (const s of sys.systems || []) map[s.id] = s.system_prompt || "";
    setEditPrompt(map);
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const max = systemSlug === "r1" ? 1 : 10;
    const next = [...images];
    for (const file of Array.from(files).slice(0, max)) {
      if (systemSlug === "r1") {
        next.splice(0, next.length, await fileToImage(file));
      } else if (next.length < 10) {
        next.push(await fileToImage(file));
      }
    }
    setImages(next.slice(0, max));
  }

  const variants = current?.system_variants?.length ? current.system_variants : R1_FALLBACK;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ color: "#E5152A", margin: 0, fontSize: 22, letterSpacing: 1 }}>PROMPT_ENGINE</h1>
          <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
            {email}
            {isAdmin ? " · admin" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ border: "1px solid #333", padding: "6px 10px", borderRadius: 8 }}>
            Kredyty: {credits ?? "—"}
          </span>
          {(["console", "library", ...(isAdmin ? (["admin"] as const) : [])] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={async () => {
                setTab(t);
                if (t === "library") await loadLibrary();
                if (t === "admin") await loadAdmin();
              }}
              style={{
                background: tab === t ? "#E5152A" : "#1a1a1a",
                color: "#fff",
                border: "none",
                padding: "8px 12px",
                borderRadius: 8,
              }}
            >
              {t}
            </button>
          ))}
          <button
            onClick={async () => {
              await getSupabaseBrowser().then((s) => s.auth.signOut());
              window.location.href = "/login";
            }}
            style={{ background: "transparent", color: "#aaa", border: "1px solid #333", padding: "8px 12px", borderRadius: 8 }}
          >
            Wyloguj
          </button>
        </div>
      </header>

      {tab === "console" && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <label>
              System
              <select value={systemSlug} onChange={(e) => setSystemSlug(e.target.value as any)} style={field}>
                {systems.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.icon || ""} {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select value={modelOverride} onChange={(e) => setModelOverride(e.target.value)} style={field}>
                <option value="">domyślny ({current?.model || "—"})</option>
                {ALLOWED_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {systemSlug !== "r1" && (
              <label>
                Długość
                <select value={lengthMode} onChange={(e) => setLengthMode(e.target.value as any)} style={field}>
                  <option value="short">short</option>
                  <option value="std">std</option>
                  <option value="long">long</option>
                </select>
              </label>
            )}
            <label>
              Format
              <select value={formatMode} onChange={(e) => setFormatMode(e.target.value as any)} style={field}>
                <option value="together">RAZEM</option>
                <option value="separate">OSOBNO</option>
              </select>
            </label>
            {systemSlug === "r1" && (
              <>
                <label>
                  Wariant
                  <select value={variant} onChange={(e) => setVariant(e.target.value)} style={field}>
                    {variants.map((v) => (
                      <option key={v.slug} value={v.slug}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                {variant !== "analyze" && variant !== "repair" && (
                  <label>
                    Liczba
                    <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} style={field} />
                  </label>
                )}
              </>
            )}
          </div>

          <p style={{ opacity: 0.75, fontSize: 13, marginTop: 12 }}>
            {current?.desc_user} {current?.inputs_desc}
          </p>
          <p style={{ fontSize: 13 }}>
            Koszt tej operacji: <b>{previewCost}</b> kredytów (ta sama formuła co backend).
          </p>

          {systemSlug === "n1" && (
            <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <button onClick={() => setMode("img")} style={mode === "img" ? activeChip : chip}>
                ZAŁĄCZNIKI
              </button>
              <button onClick={() => setMode("prompt")} style={mode === "prompt" ? activeChip : chip}>
                PROMPT
              </button>
            </div>
          )}

          {(systemSlug !== "n1" || mode === "img") && (
            <div>
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple={systemSlug !== "r1"} onChange={(e) => onFiles(e.target.files)} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8, marginTop: 10 }}>
                {images.map((img, i) => (
                  <img key={i} src={img.preview} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8 }} />
                ))}
              </div>
            </div>
          )}

          {systemSlug === "n1" && mode === "prompt" && (
            <textarea value={pastedPrompt} onChange={(e) => setPastedPrompt(e.target.value)} placeholder="Wklej prompt do neutralizacji" style={{ ...field, minHeight: 120, width: "100%" }} />
          )}

          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Brief (opcjonalnie)" style={{ ...field, minHeight: 80, width: "100%", marginTop: 10 }} />

          {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
          <button disabled={busy} onClick={generate} style={{ ...activeChip, marginTop: 12, padding: "10px 18px" }}>
            {busy ? "Generuję…" : "Generuj"}
          </button>

          <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
            {blocks.map((b, i) => (
              <ResultCard
                key={b.id || i}
                index={i + 1}
                block={b}
                formatMode={formatMode}
                folders={folders}
                onFolders={setFolders}
              />
            ))}
          </div>
        </section>
      )}

      {tab === "library" && (
        <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {library.map((p) => (
            <article key={p.id} style={card}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{p.created_at} · {p.word_count} słów</div>
              <pre style={pre}>{p.prompt}</pre>
              {p.negative ? <pre style={pre}>NEGATIVE: {p.negative}</pre> : null}
            </article>
          ))}
          {!library.length && <p>Brak zapisanych promptów.</p>}
        </section>
      )}

      {tab === "admin" && isAdmin && (
        <section style={{ marginTop: 24 }}>
          <h2>Systemy</h2>
          {adminSystems.map((s) => (
            <article key={s.id} style={card}>
              <b>{s.label}</b> ({s.slug}) v{s.version}
              <textarea
                value={editPrompt[s.id] ?? ""}
                onChange={(e) => setEditPrompt((m) => ({ ...m, [s.id]: e.target.value }))}
                style={{ ...field, width: "100%", minHeight: 140, marginTop: 8 }}
              />
              <button
                style={chip}
                onClick={async () => {
                  await authFetch(`/api/admin/systems/${s.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ systemPrompt: editPrompt[s.id] }),
                  });
                  await loadAdmin();
                }}
              >
                Zapisz instrukcję
              </button>
            </article>
          ))}

          <h2>Użytkownicy</h2>
          {adminUsers.map((u) => (
            <div key={u.id} style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span>{u.email}</span>
              <span>saldo {u.credits?.balance ?? "—"}</span>
              <button
                style={chip}
                onClick={async () => {
                  const amount = Number(prompt("Ile kredytów dodać?", "50"));
                  if (!Number.isFinite(amount)) return;
                  await authFetch(`/api/admin/users/${u.id}/credits`, {
                    method: "POST",
                    body: JSON.stringify({ amount }),
                  });
                  await loadAdmin();
                }}
              >
                Kredyty
              </button>
              <button
                style={chip}
                onClick={async () => {
                  await authFetch(`/api/admin/users/${u.id}/ban`, {
                    method: "POST",
                    body: JSON.stringify({ banned: !u.is_banned }),
                  });
                  await loadAdmin();
                }}
              >
                {u.is_banned ? "Odbanuj" : "Ban"}
              </button>
            </div>
          ))}

          <h2>Koszt / marża</h2>
          <pre style={pre}>{JSON.stringify(costSummary?.summary ?? {}, null, 2)}</pre>
          <h2>Oceny</h2>
          <pre style={pre}>{JSON.stringify(ratingsSummary ?? {}, null, 2)}</pre>
          <h2>Kalibracja (ostatnie 20)</h2>
          <pre style={pre}>{JSON.stringify(calibration ?? {}, null, 2)}</pre>
        </section>
      )}

      <footer style={{ marginTop: 48, fontSize: 12, opacity: 0.55 }}>
        Output jest treścią wygenerowaną przez AI. <a href="/terms">Terms of Use</a>
      </footer>
    </main>
  );
}

function ResultCard({
  index,
  block,
  formatMode,
  folders,
  onFolders,
}: {
  index: number;
  block: { id?: string; prompt: string; negative: string };
  formatMode: "together" | "separate";
  folders: { id: string; name: string }[];
  onFolders: (f: { id: string; name: string }[]) => void;
}) {
  const [openRate, setOpenRate] = useState(false);
  const words = block.prompt.trim().split(/\s+/).filter(Boolean).length;

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <article style={card}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b>Blok {index}</b>
        <span>{words} słów</span>
      </div>
      <pre style={pre}>{block.prompt}</pre>
      {block.negative ? <pre style={pre}>NEGATIVE: {block.negative}</pre> : null}
      {formatMode === "together" ? (
        <button style={chip} onClick={() => copy(`${block.prompt}\n\nNEGATIVE: ${block.negative}`)}>
          KOPIUJ
        </button>
      ) : (
        <>
          <button style={chip} onClick={() => copy(block.prompt)}>
            KOPIUJ PROMPT
          </button>
          <button style={chip} onClick={() => copy(block.negative)}>
            KOPIUJ NEGATIVE
          </button>
        </>
      )}
      <select
        style={{ ...field, width: 220, display: "inline-block", marginLeft: 8 }}
        defaultValue=""
        onChange={async (e) => {
          const val = e.target.value;
          if (!val || !block.id) return;
          if (val === "__new") {
            const name = prompt("Nazwa folderu");
            if (!name) return;
            const json = await authFetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
            onFolders([json.folder, ...folders]);
            await authFetch(`/api/prompts/${block.id}`, { method: "PATCH", body: JSON.stringify({ folderId: json.folder.id }) });
            return;
          }
          await authFetch(`/api/prompts/${block.id}`, { method: "PATCH", body: JSON.stringify({ folderId: val }) });
        }}
      >
        <option value="">+ Dodaj do folderu</option>
        <option value="__new">Nowy folder…</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <div>
        <button style={{ ...chip, marginTop: 8 }} onClick={() => setOpenRate((v) => !v)}>
          oceń render
        </button>
      </div>
      {openRate && block.id && (
        <div style={{ marginTop: 8 }}>
          {ERROR_AXES.map((tag) => (
            <button
              key={tag}
              style={chip}
              onClick={() =>
                authFetch("/api/ratings", {
                  method: "POST",
                  body: JSON.stringify({ promptId: block.id, verdict: "fail", tags: [tag] }),
                })
              }
            >
              {tag}
            </button>
          ))}
          <button
            style={activeChip}
            onClick={() =>
              authFetch("/api/ratings", {
                method: "POST",
                body: JSON.stringify({ promptId: block.id, verdict: "pass", tags: [] }),
              })
            }
          >
            PASS
          </button>
        </div>
      )}
    </article>
  );
}

const field: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  background: "#141414",
  color: "#ededed",
  border: "1px solid #333",
  borderRadius: 8,
  padding: 8,
};
const chip: CSSProperties = {
  background: "#1a1a1a",
  color: "#fff",
  border: "1px solid #333",
  padding: "6px 10px",
  borderRadius: 8,
  marginRight: 6,
};
const activeChip: React.CSSProperties = { ...chip, background: "#E5152A", borderColor: "#E5152A" };
const card: CSSProperties = { background: "#121212", border: "1px solid #2a2a2a", borderRadius: 12, padding: 14 };
const pre: CSSProperties = { whiteSpace: "pre-wrap", fontSize: 13, background: "#0d0d0d", padding: 10, borderRadius: 8 };
