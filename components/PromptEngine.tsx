"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ALLOWED_MODELS } from "@/lib/models";
import { calculateCreditCost } from "@/lib/credits";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Tab = "konsola" | "pomoc" | "biblioteka" | "nauczyciel" | "admin";
type PublicSystem = {
  id: string;
  slug: "n1" | "s1" | "r1";
  label: string;
  icon?: string;
  model: string;
  credits_per_block: number;
  desc_user?: string;
  inputs_desc?: string;
};

const T = {
  bg: "#0A0A0A",
  panel: "#141414",
  panel2: "#1C1C1C",
  line: "#272727",
  line2: "#3A3A3A",
  text: "#EDEDED",
  muted: "#8A8A8A",
  red: "#E5152A",
  green: "#22C55E",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const MODEL_OPTIONS = [
  { v: "gpt-5.6-luna", l: "GPT-5.6 Luna" },
  { v: "gpt-5.6-terra", l: "GPT-5.6 Terra" },
  { v: "grok-4.3", l: "Grok 4.3" },
  { v: "grok-4.6", l: "Grok 4.6" },
];

const R1_VARIANTS = [
  { id: "standard", label: "standard" },
  { id: "pose", label: "pose — ciało" },
  { id: "face", label: "face — ekspresja" },
  { id: "cam", label: "cam — kadr" },
  { id: "analyze", label: "analyze — analiza bazy" },
  { id: "repair", label: "repair — naprawa dryfu" },
];

const LENGTHS = [
  { id: "short" as const, l: "110–200" },
  { id: "std" as const, l: "300–420" },
  { id: "long" as const, l: "420–520" },
];

const ERROR_TAGS = [
  "identity drift",
  "dłonie / palce",
  "gaze poza obiektyw",
  "outfit drift",
  "światło ≠ scena",
  "plastikowa skóra",
  "anatomia",
  "tło / kadr",
];

function uniqueImageFiles(files: File[]) {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const f of files) {
    if (f.type && !f.type.startsWith("image/")) continue;
    const key = `${f.size}:${f.type || "image"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function filesForOnePaste(files: File[]) {
  const unique = uniqueImageFiles(files);
  const bySize = new Map<number, File>();
  for (const f of unique) {
    if (!bySize.has(f.size)) bySize.set(f.size, f);
  }
  return [...bySize.values()];
}

function pasteTargetIsField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return true;
  return Boolean(el.closest?.("textarea, input, [contenteditable='true']"));
}

function StudioModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: T.panel,
          border: `1px solid ${T.line2}`,
          padding: 16,
          fontFamily: MONO,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.red, marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

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

function fileToImage(file: File): Promise<{ id: string; base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1] || "";
      resolve({ id: Math.random().toString(36).slice(2, 10), base64, mime: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

function imageToPreview(base64: string, mime: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 200;
      const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mime};base64,${base64}`;
  });
}

function Chip({
  children,
  active,
  onClick,
  danger,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.06em",
        color: active ? "#0A0A0A" : T.text,
        background: active ? (danger ? T.red : "#FFFFFF") : "transparent",
        border: `1px solid ${active ? "#FFFFFF" : T.line2}`,
        padding: "4px 10px",
      }}
    >
      {children}
    </button>
  );
}

function Sel({
  value,
  onChange,
  options,
  width = 170,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        background: T.bg,
        color: T.text,
        border: `1px solid ${T.line2}`,
        width,
        padding: "4px 8px",
        colorScheme: "dark",
      }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v} style={{ background: T.bg, color: T.text }}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.14em" }}>{children}</span>
);

function OnboardingGuide({
  systems,
  onDone,
}: {
  systems: PublicSystem[];
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      t: "SYSTEM",
      b: "N1 = scena ze zdjęć. S1 = styl / look. R1 = seria wariantów z jednej bazy. Wybierz na górze konsoli.",
    },
    {
      t: "WEJŚCIE",
      b: "Wrzuć zdjęcie (klik, drop albo Ctrl+V). N1 może też pracować na wklejonym prompcie zamiast zdjęcia.",
    },
    {
      t: "URUCHOM",
      b: "Czerwony przycisk na dole lewej kolumny. Zużywa kredyty. Wynik to tekst do kopiowania, nie obraz.",
    },
    {
      t: "KOPIUJ",
      b: "Przy bloku: KOPIUJ. Potem BIBLIOTEKA — historia i foldery.",
    },
  ];
  const s = steps[step];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, background: T.panel, border: `1px solid ${T.line2}`, padding: 20, fontFamily: MONO }}>
        <div style={{ fontSize: 11, color: T.red, letterSpacing: "0.12em" }}>
          PIERWSZE WEJŚCIE {step + 1}/{steps.length}
        </div>
        <h2 style={{ fontSize: 16, margin: "12px 0 8px" }}>{s.t}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: T.muted }}>{s.b}</p>
        {step === 0 && (
          <ul style={{ fontSize: 12, color: T.text, lineHeight: 1.8, paddingLeft: 18 }}>
            {systems.slice(0, 3).map((sys) => (
              <li key={sys.slug}>
                <strong>{sys.label}</strong>
                {sys.desc_user ? ` — ${sys.desc_user}` : ""}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "space-between" }}>
          <button type="button" onClick={onDone} style={{ fontFamily: MONO, fontSize: 10, background: "none", border: "none", color: T.muted }}>
            POMIŃ
          </button>
          <button
            type="button"
            onClick={() => (step >= steps.length - 1 ? onDone() : setStep(step + 1))}
            style={{ fontFamily: MONO, fontSize: 11, background: T.red, color: "#fff", border: "none", padding: "8px 14px" }}
          >
            {step >= steps.length - 1 ? "ROZUMIEM" : "DALEJ"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PromptEngine() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("konsola");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referredCount, setReferredCount] = useState(0);
  const [teacherStats, setTeacherStats] = useState<{
    referrals: { id: string; email: string; status: string; commission: number }[];
    activeCount: number;
    commissionTotal: number;
    payoutPending: boolean;
  } | null>(null);
  const [payouts, setPayouts] = useState<{ id: string; email: string; status: string; created_at: string }[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [systems, setSystems] = useState<PublicSystem[]>([]);
  const [systemSlug, setSystemSlug] = useState<"n1" | "s1" | "r1">("n1");
  const [mode, setMode] = useState<"img" | "prompt">("img");
  const [images, setImages] = useState<{ id: string; base64: string; mime: string }[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const pasteLockAt = useRef(0);
  const [pastedPrompt, setPastedPrompt] = useState("");
  const [brief, setBrief] = useState("");
  const [variant, setVariant] = useState("standard");
  const [count, setCount] = useState(4);
  const [lengthMode, setLengthMode] = useState<"short" | "std" | "long">("std");
  const [modelOverride, setModelOverride] = useState("");
  const [formatMode, setFormatMode] = useState<"together" | "separate">("together");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocks, setBlocks] = useState<{ id?: string; prompt: string; negative: string }[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [dragOver, setDragOver] = useState(false);
  const [adminSystems, setAdminSystems] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [costSummary, setCostSummary] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [showOnboard, setShowOnboard] = useState(false);
  const [ratingsSummary, setRatingsSummary] = useState<Record<string, { total: number; pass: number; tags: Record<string, number> }>>({});
  const [libFolderOpen, setLibFolderOpen] = useState(false);
  const [libFolderName, setLibFolderName] = useState("");
  const [adminModal, setAdminModal] = useState<null | { kind: "credits" | "ref"; userId: string; email: string; value: string }>(null);

  const current = systems.find((s) => s.slug === systemSlug);
  const isR1 = systemSlug === "r1";
  const isAnalyze = isR1 && (variant === "analyze" || variant === "repair");
  const showDrop = !(systemSlug === "n1" && mode === "prompt");
  const maxImgs = isR1 || systemSlug === "s1" ? 1 : 10;

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
        setReferralCode(me.user.referralCode || "");
        setReferredCount(me.referredCount || 0);
        if (!me.user.onboardingCompletedAt) setShowOnboard(true);
        setCredits(me.credits);
        const savedRef = typeof window !== "undefined" ? localStorage.getItem("brns_ref") : null;
        if (savedRef) {
          try {
            await authFetch("/api/me/referral", { method: "POST", body: JSON.stringify({ code: savedRef }) });
            localStorage.removeItem("brns_ref");
            const me2 = await authFetch("/api/me");
            setReferredCount(me2.referredCount || 0);
          } catch {
            /* nieznany kod albo kolumna jeszcze nie ma — nie blokuj konsoli */
          }
        }
        const sys = await authFetch("/api/systems");
        const list = sys.systems || [];
        setSystems(list);
        if (!list.length) setLoadErr("Brak systemów w bazie (systems_public).");
        const fol = await authFetch("/api/folders");
        setFolders(fol.folders || []);
      } catch (e: any) {
        if (String(e.message).includes("401") || String(e.message).includes("autoryz")) {
          window.location.href = "/login";
        } else setLoadErr(e.message || "Błąd ładowania.");
      }
    })();
  }, []);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (!showDrop) return;
      if (pasteTargetIsField(e.target)) return;
      const now = Date.now();
      if (now - pasteLockAt.current < 400) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const files = filesForOnePaste([
        ...Array.from(e.clipboardData?.files || []),
        ...Array.from(e.clipboardData?.items || [])
          .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
          .map((it) => it.getAsFile())
          .filter((f): f is File => Boolean(f)),
      ]);
      if (!files.length) return;
      pasteLockAt.current = now;
      e.preventDefault();
      e.stopImmediatePropagation();
      await addFiles(files);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [showDrop, systemSlug, isR1, maxImgs]);

  async function addFiles(fileList: File[] | FileList) {
    const arr = uniqueImageFiles(Array.from(fileList));
    const next = [...imagesRef.current];
    for (const file of arr) {
      if (next.length >= maxImgs) break;
      if (isR1 || systemSlug === "s1") {
        next.splice(0, next.length, await fileToImage(file));
      } else next.push(await fileToImage(file));
    }
    const sliced = next.slice(0, maxImgs);
    imagesRef.current = sliced;
    setImages(sliced);
  }

  async function generate() {
    setBusy(true);
    setError("");
    try {
      if (!systems.length) throw new Error("Brak systemów. Seed N1/S1/R1 w bazie.");
      const sourcePreviews = await Promise.all(images.map((img) => imageToPreview(img.base64, img.mime)));
      const json = await authFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          systemSlug,
          mode: systemSlug === "n1" ? mode : undefined,
          images: images.map(({ base64, mime }) => ({ base64, mime })),
          sourcePreviews,
          pastedPrompt,
          brief,
          variant: isR1 ? variant : undefined,
          count: isR1 ? count : undefined,
          lengthMode: isR1 ? undefined : lengthMode,
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
    const rows: any[] = json.prompts || [];
    const byId = new Map<string, any>();
    for (const p of rows) {
      if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
    }
    setLibrary(byId.size ? [...byId.values()] : rows);
  }

  async function loadAdminShell() {
    const [sys, users, cost, pay, ratings] = await Promise.all([
      authFetch("/api/admin/systems?meta=1"),
      authFetch("/api/admin/users"),
      authFetch("/api/admin/cost-summary"),
      authFetch("/api/admin/payouts").catch(() => ({ payouts: [] })),
      authFetch("/api/admin/ratings-summary").catch(() => ({ summary: {} })),
    ]);
    setAdminSystems(sys.systems || []);
    setAdminUsers(users.users || []);
    setCostSummary(cost);
    setPayouts(pay.payouts || []);
    setRatingsSummary(ratings.summary || {});
    setEditId(null);
    setEditPrompt("");
  }

  async function loadTeacher() {
    const json = await authFetch("/api/referrals");
    setTeacherStats(json);
    setReferredCount((json.referrals || []).length);
  }

  async function finishOnboarding() {
    setShowOnboard(false);
    try {
      await authFetch("/api/me/onboarding", { method: "POST" });
    } catch {
      /* kolumna SQL jeszcze nie ma — overlay i tak znika w tej sesji */
    }
  }

  async function openEdit(id: string) {
    const json = await authFetch(`/api/admin/systems/${id}`);
    setEditId(id);
    setEditPrompt(json.system?.system_prompt || "");
  }

  const libFiltered =
    activeFolder === "all"
      ? library
      : library.filter((p) => (activeFolder === "none" ? !p.folder_id : p.folder_id === activeFolder));

  const ghostBtn: CSSProperties = {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: "0.08em",
    padding: "4px 10px",
    color: T.text,
    background: "transparent",
    border: `1px solid ${T.line2}`,
  };

  return (
    <div style={{ background: T.bg, color: T.text, fontFamily: MONO, minHeight: "100vh" }}>
      {showOnboard && <OnboardingGuide systems={systems} onDone={finishOnboarding} />}
      {libFolderOpen && (
        <StudioModal title="NOWY FOLDER" onClose={() => setLibFolderOpen(false)}>
          <input
            autoFocus
            value={libFolderName}
            onChange={(e) => setLibFolderName(e.target.value)}
            placeholder="Nazwa"
            style={{
              width: "100%",
              fontFamily: MONO,
              fontSize: 13,
              background: T.bg,
              color: T.text,
              border: `1px solid ${T.line2}`,
              padding: 10,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={ghostBtn} onClick={() => setLibFolderOpen(false)}>
              ANULUJ
            </button>
            <button
              type="button"
              style={{ ...ghostBtn, borderColor: T.red, color: T.red }}
              onClick={async () => {
                const name = libFolderName.trim();
                if (!name) return;
                const json = await authFetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
                setFolders((f) => [json.folder, ...f.filter((x) => x.id !== json.folder.id)]);
                setLibFolderName("");
                setLibFolderOpen(false);
                setActiveFolder(json.folder.id);
              }}
            >
              ZAPISZ
            </button>
          </div>
        </StudioModal>
      )}
      {adminModal && (
        <StudioModal title={adminModal.kind === "credits" ? "KREDYTY" : "KOD REF"} onClose={() => setAdminModal(null)}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{adminModal.email}</div>
          <input
            autoFocus
            value={adminModal.value}
            onChange={(e) => setAdminModal({ ...adminModal, value: e.target.value })}
            placeholder={adminModal.kind === "credits" ? "50" : "ania"}
            style={{
              width: "100%",
              fontFamily: MONO,
              fontSize: 13,
              background: T.bg,
              color: T.text,
              border: `1px solid ${T.line2}`,
              padding: 10,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={ghostBtn} onClick={() => setAdminModal(null)}>
              ANULUJ
            </button>
            <button
              type="button"
              style={{ ...ghostBtn, borderColor: T.red, color: T.red }}
              onClick={async () => {
                if (adminModal.kind === "credits") {
                  const amount = Number(adminModal.value);
                  if (!Number.isFinite(amount)) return;
                  await authFetch(`/api/admin/users/${adminModal.userId}/credits`, {
                    method: "POST",
                    body: JSON.stringify({ amount }),
                  });
                } else {
                  await authFetch(`/api/admin/users/${adminModal.userId}/referral`, {
                    method: "POST",
                    body: JSON.stringify({ code: adminModal.value }),
                  });
                }
                setAdminModal(null);
                await loadAdminShell();
              }}
            >
              ZAPISZ
            </button>
          </div>
        </StudioModal>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderBottom: `1px solid ${T.line}`,
          position: "sticky",
          top: 0,
          background: T.bg,
          zIndex: 10,
        }}
      >
        <div>
          <span style={{ fontSize: 14, letterSpacing: "0.14em", color: T.red }}>PROMPT_ENGINE</span>
          <span style={{ fontSize: 10, color: T.muted, marginLeft: 8 }}>
            {email}
            {isAdmin ? " · admin" : ""}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(
            ["konsola", "pomoc", "biblioteka", ...(referralCode ? (["nauczyciel"] as const) : []), ...(isAdmin ? (["admin"] as const) : [])] as Tab[]
          ).map((t) => (
            <Chip
              key={t}
              active={tab === t}
              onClick={async () => {
                setTab(t);
                if (t === "biblioteka") await loadLibrary();
                if (t === "nauczyciel") await loadTeacher();
                if (t === "admin") await loadAdminShell();
              }}
            >
              {t.toUpperCase()}
            </Chip>
          ))}
          <span
            style={{
              padding: "4px 10px",
              fontSize: 11,
              border: `1px solid ${T.line2}`,
              color: (credits ?? 0) > 20 ? T.green : T.red,
            }}
          >
            {credits ?? "—"} kredytów
          </span>
          <button
            type="button"
            style={ghostBtn}
            onClick={async () => {
              await getSupabaseBrowser().then((s) => s.auth.signOut());
              window.location.href = "/login";
            }}
          >
            WYLOGUJ
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {loadErr && (
          <div style={{ border: `1px solid ${T.red}`, color: T.red, fontSize: 11, padding: 12, marginBottom: 16 }}>
            {loadErr}
          </div>
        )}

        {tab === "konsola" && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "12px 24px",
                padding: 12,
                marginBottom: 20,
                border: `1px solid ${T.line}`,
                background: T.panel,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Label>SYSTEM</Label>
                <Sel
                  width={120}
                  value={systemSlug}
                  onChange={(v) => {
                    setSystemSlug(v as any);
                    setImages([]);
                    setBlocks([]);
                  }}
                  options={systems.map((s) => ({ v: s.slug, l: `${s.icon || ""} ${s.label}` }))}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Label>MODEL</Label>
                <Sel
                  width={150}
                  value={modelOverride || current?.model || ALLOWED_MODELS[0]}
                  onChange={setModelOverride}
                  options={MODEL_OPTIONS}
                />
              </div>
              {isR1 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Label>WARIANT</Label>
                    <Sel
                      width={180}
                      value={variant}
                      onChange={setVariant}
                      options={R1_VARIANTS.map((v) => ({ v: v.id, l: v.label }))}
                    />
                  </div>
                  {!isAnalyze && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Label>LICZBA</Label>
                      <Sel
                        width={56}
                        value={String(count)}
                        onChange={(v) => setCount(Number(v))}
                        options={Array.from({ length: 10 }, (_, i) => ({ v: String(i + 1), l: String(i + 1) }))}
                      />
                    </div>
                  )}
                </>
              )}
              {systemSlug === "n1" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Label>WEJŚCIE</Label>
                  <Chip active={mode === "img"} onClick={() => setMode("img")}>
                    ZAŁĄCZNIKI
                  </Chip>
                  <Chip active={mode === "prompt"} onClick={() => setMode("prompt")}>
                    PROMPT
                  </Chip>
                </div>
              )}
              {!isR1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Label>DŁUGOŚĆ</Label>
                  <Sel
                    width={90}
                    value={lengthMode}
                    onChange={(v) => setLengthMode(v as any)}
                    options={LENGTHS.map((l) => ({ v: l.id, l: l.l }))}
                  />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Label>FORMAT</Label>
                <Chip active={formatMode === "together"} onClick={() => setFormatMode("together")}>
                  RAZEM
                </Chip>
                <Chip active={formatMode === "separate"} onClick={() => setFormatMode("separate")}>
                  OSOBNO
                </Chip>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
                <span style={{ fontSize: 10, color: T.muted }}>
                  koszt: <span style={{ color: previewCost > (credits ?? 0) ? T.red : T.text }}>{previewCost}</span>
                </span>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    background: busy ? T.line2 : T.red,
                    color: "#fff",
                    border: "none",
                    padding: "8px 20px",
                  }}
                >
                  {busy ? "PRACUJE…" : "URUCHOM"}
                </button>
              </div>
            </div>

            {systemSlug === "n1" && mode === "prompt" ? (
              <div style={{ border: `1px solid ${T.line2}`, background: T.panel, marginBottom: 20 }}>
                <textarea
                  value={pastedPrompt}
                  onChange={(e) => setPastedPrompt(e.target.value)}
                  placeholder="Wklej cudzy prompt. N1 zdejmie opis wyglądu i zostawi scenę 1:1."
                  style={{
                    width: "100%",
                    minHeight: 150,
                    background: "transparent",
                    color: T.text,
                    fontFamily: MONO,
                    fontSize: 12.5,
                    lineHeight: 1.7,
                    border: "none",
                    padding: 12,
                    resize: "vertical",
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <Label>
                    {isR1 ? "BAZA — 1 OBRAZ" : systemSlug === "s1" ? "OBRAZ — OPCJONALNY" : `INSPIRACJE — ${images.length}/10`}
                    {" · drop / Ctrl+V"}
                  </Label>
                  {images.length > 0 && (
                    <button type="button" onClick={() => setImages([])} style={{ ...ghostBtn, color: T.red }}>
                      WYCZYŚĆ
                    </button>
                  )}
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
                  }}
                  style={{ display: "flex", flexWrap: "wrap", gap: 12 }}
                >
                  {images.map((img, i) => (
                    <div key={img.id} style={{ position: "relative", width: 112, height: 146, border: `1px solid ${T.line2}` }}>
                      <img
                        src={`data:${img.mime};base64,${img.base64}`}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
                      />
                      <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9, background: T.bg, color: T.red, padding: "0 4px" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setImages(images.filter((x) => x.id !== img.id))}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          fontSize: 9,
                          background: T.bg,
                          color: T.muted,
                          border: "none",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {images.length < maxImgs && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      style={{
                        width: 112,
                        height: 146,
                        border: `1px dashed ${dragOver ? T.red : T.line2}`,
                        background: T.panel,
                        color: T.muted,
                        fontSize: 20,
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple={maxImgs > 1}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            <div style={{ border: `1px solid ${T.line}`, background: T.panel }}>
              <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", padding: "8px 12px 0" }}>
                BRIEF — opcjonalna notatka dla modelu. Przy S1 może zastąpić zdjęcie. Przy N1/R1 dodatek do wejścia.
              </div>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={
                  isR1
                    ? "Opcjonalny kierunek serii…"
                    : "Np. złote światło, wieczór. Puste = pracuj wyłącznie na wejściu."
                }
                style={{
                  width: "100%",
                  minHeight: 64,
                  background: "transparent",
                  color: T.text,
                  fontFamily: MONO,
                  fontSize: 12,
                  border: "none",
                  padding: 12,
                  resize: "vertical",
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.8 }}>
              {current?.desc_user} {current?.inputs_desc}
            </div>
            {error && (
              <div style={{ marginTop: 16, padding: 12, border: `1px solid ${T.red}`, color: T.red, fontSize: 11 }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              {blocks.map((b, i) => (
                <ResultCard
                  key={b.id || i}
                  index={i + 1}
                  block={b}
                  formatMode={formatMode}
                  folders={folders}
                  onFolders={setFolders}
                  onAssigned={loadLibrary}
                />
              ))}
              {!blocks.length && !busy && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 56,
                    border: `1px dashed ${T.line}`,
                    color: T.muted,
                    fontSize: 11,
                    lineHeight: 2,
                  }}
                >
                  Wybierz system, wrzuć wejście (drop albo Ctrl+V), uruchom.
                  <br />
                  N1 z pięcioma zdjęciami zwróci pięć osobnych bloków.
                </div>
              )}
            </div>
          </>
        )}

        {tab === "pomoc" && (
          <div>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.red }}>JAK TO DZIAŁA</h2>
            <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.7, maxWidth: 640 }}>
              Wynik to prompt tekstowy do kopiowania, nie wygenerowany obraz. Brief to opcjonalna notatka dla modelu.
            </p>
            {systems.map((s) => (
              <article key={s.slug} style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 14, marginTop: 12 }}>
                <div style={{ fontSize: 13, color: T.text }}>
                  {s.icon} {s.label}
                </div>
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, margin: "8px 0 0" }}>{s.desc_user || "—"}</p>
                {s.inputs_desc && (
                  <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0" }}>Wejście: {s.inputs_desc}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {tab === "biblioteka" && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <Chip active={activeFolder === "all"} onClick={() => setActiveFolder("all")}>
                WSZYSTKIE ({library.length})
              </Chip>
              <Chip active={activeFolder === "none"} onClick={() => setActiveFolder("none")}>
                BEZ FOLDERU
              </Chip>
              {folders.map((f) => (
                <Chip key={f.id} active={activeFolder === f.id} onClick={() => setActiveFolder(f.id)}>
                  {f.name}
                </Chip>
              ))}
              <Chip active={false} onClick={() => setLibFolderOpen(true)}>
                + FOLDER
              </Chip>
            </div>
            {libFiltered.map((p) => {
              const copyText =
                p.format_mode === "together" && p.negative
                  ? `${p.prompt}\n\nNegative prompt: ${p.negative}`
                  : p.prompt;
              return (
                <article
                  key={p.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    border: `1px solid ${T.line}`,
                    background: T.panel,
                    marginBottom: 12,
                    padding: 12,
                  }}
                >
                  {p.source_preview ? (
                    <img
                      src={p.source_preview}
                      alt=""
                      style={{ width: 72, height: 94, objectFit: "cover", border: `1px solid ${T.line2}`, flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 94,
                        flexShrink: 0,
                        border: `1px dashed ${T.line2}`,
                        background: T.panel2,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ fontSize: 10, color: T.muted }}>
                        {p.created_at} · {p.word_count} słów
                      </div>
                      <button
                        type="button"
                        style={ghostBtn}
                        onClick={() => navigator.clipboard.writeText(copyText)}
                      >
                        KOPIUJ
                      </button>
                    </div>
                    <select
                      value={p.folder_id || ""}
                      onChange={async (e) => {
                        const folderId = e.target.value || null;
                        await authFetch(`/api/prompts/${p.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ folderId }),
                        });
                        await loadLibrary();
                      }}
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        background: T.bg,
                        color: T.text,
                        border: `1px solid ${T.line2}`,
                        marginTop: 8,
                        padding: "3px 6px",
                        colorScheme: "dark",
                      }}
                    >
                      <option value="">Bez folderu</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: "8px 0 0" }}>{p.prompt}</pre>
                  </div>
                </article>
              );
            })}
            {!libFiltered.length && <p style={{ color: T.muted, fontSize: 11 }}>Brak promptów.</p>}
          </div>
        )}

        {tab === "nauczyciel" && referralCode && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.red, marginBottom: 12 }}>AFILIACJA</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: T.muted }}>
                Kod: <span style={{ color: T.text }}>{referralCode}</span>
                <br />
                Poleceni: {teacherStats?.referrals.length ?? referredCount} · aktywni: {teacherStats?.activeCount ?? "—"}
                <br />
                Prowizja (zł): {teacherStats?.commissionTotal ?? 0} — naliczanie po płatnościach, jeszcze nie.
              </p>
              <button
                type="button"
                style={{ ...ghostBtn, marginTop: 12, marginRight: 8 }}
                onClick={() => {
                  const url = `${window.location.origin}/login?ref=${encodeURIComponent(referralCode)}`;
                  navigator.clipboard.writeText(url);
                }}
              >
                KOPIUJ LINK
              </button>
              <button
                type="button"
                style={ghostBtn}
                disabled={teacherStats?.payoutPending}
                onClick={async () => {
                  await authFetch("/api/referrals", { method: "POST" });
                  await loadTeacher();
                }}
              >
                {teacherStats?.payoutPending ? "CZEKA NA WYPŁATĘ" : "ZLEĆ WYPŁATĘ"}
              </button>
            </div>
            {(teacherStats?.referrals || []).map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  border: `1px solid ${T.line}`,
                  padding: 10,
                  marginBottom: 6,
                  fontSize: 12,
                }}
              >
                <span>{r.email}</span>
                <span style={{ color: T.muted }}>{r.status}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "admin" && isAdmin && (
          <section>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>WYPŁATY NAUCZYCIELI</h2>
            {payouts.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  border: `1px solid ${T.line}`,
                  padding: 8,
                  marginBottom: 6,
                  fontSize: 12,
                }}
              >
                <span>{p.email}</span>
                <span style={{ color: T.muted }}>{p.status}</span>
                {p.status === "pending" && (
                  <button
                    type="button"
                    style={ghostBtn}
                    onClick={async () => {
                      await authFetch("/api/admin/payouts", { method: "POST", body: JSON.stringify({ id: p.id, status: "done" }) });
                      await loadAdminShell();
                    }}
                  >
                    OZNACZ WYPŁACONE
                  </button>
                )}
              </div>
            ))}
            {!payouts.length && <p style={{ color: T.muted, fontSize: 11 }}>Brak zgłoszeń.</p>}
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted, marginTop: 24 }}>USERZY</h2>
            {adminUsers.map((u) => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  border: `1px solid ${T.line}`,
                  background: T.panel,
                  padding: 10,
                  marginBottom: 8,
                  fontSize: 12,
                }}
              >
                <span>{u.email}</span>
                <span style={{ color: T.muted }}>saldo {u.credits?.balance ?? "—"}</span>
                <span style={{ color: T.muted, fontSize: 10 }}>ref {u.referral_code || "—"}</span>
                <button
                  type="button"
                  style={ghostBtn}
                  onClick={() => setAdminModal({ kind: "ref", userId: u.id, email: u.email, value: u.referral_code || "" })}
                >
                  KOD REF
                </button>
                <button
                  type="button"
                  style={ghostBtn}
                  onClick={() => setAdminModal({ kind: "credits", userId: u.id, email: u.email, value: "50" })}
                >
                  KREDYTY
                </button>
                <button
                  type="button"
                  style={ghostBtn}
                  onClick={async () => {
                    await authFetch(`/api/admin/users/${u.id}/ban`, {
                      method: "POST",
                      body: JSON.stringify({ banned: !u.is_banned }),
                    });
                    await loadAdminShell();
                  }}
                >
                  {u.is_banned ? "ODBANUJ" : "BAN"}
                </button>
              </div>
            ))}

            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted, marginTop: 28 }}>KOSZT</h2>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
              USD {costSummary?.summary?.totalCostUsd ?? "—"} · kredyty {costSummary?.summary?.totalCreditsSpent ?? "—"}
              {costSummary?.summary?.marginWarning ? " · UWAGA marża" : ""}
            </div>
            {(costSummary?.daily || []).slice(0, 14).map((d: { day: string; cost_usd?: number; credits_spent?: number }) => (
              <div key={d.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${T.line}` }}>
                <span>{d.day}</span>
                <span>
                  {d.cost_usd ?? 0} USD / {d.credits_spent ?? 0} kr
                </span>
              </div>
            ))}

            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted, marginTop: 28 }}>OCENY</h2>
            {Object.entries(ratingsSummary).map(([k, v]) => (
              <div key={k} style={{ border: `1px solid ${T.line}`, padding: 10, marginBottom: 8, fontSize: 12 }}>
                <b>{k}</b> · {v.pass}/{v.total} PASS
                <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>
                  {Object.entries(v.tags)
                    .map(([t, n]) => `${t} ${n}`)
                    .join(" · ") || "brak tagów FAIL"}
                </div>
              </div>
            ))}
            {!Object.keys(ratingsSummary).length && <p style={{ color: T.muted, fontSize: 11 }}>Brak ocen.</p>}

            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted, marginTop: 28 }}>SYSTEMY</h2>
            {adminSystems.map((s) => (
              <article key={s.id} style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 12, marginBottom: 12 }}>
                <b>
                  {s.label} ({s.slug})
                </b>{" "}
                v{s.version}
                {editId === s.id ? (
                  <>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 180,
                        marginTop: 8,
                        background: T.bg,
                        color: T.text,
                        border: `1px solid ${T.line2}`,
                        fontFamily: MONO,
                        fontSize: 12,
                        padding: 8,
                      }}
                    />
                    <button
                      type="button"
                      style={{ ...ghostBtn, marginTop: 8, background: T.red, color: "#fff", borderColor: T.red }}
                      onClick={async () => {
                        await authFetch(`/api/admin/systems/${s.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ systemPrompt: editPrompt }),
                        });
                        setEditId(null);
                        await loadAdminShell();
                      }}
                    >
                      ZAPISZ INSTRUKCJĘ
                    </button>
                  </>
                ) : (
                  <div>
                    <button type="button" style={{ ...ghostBtn, marginTop: 8 }} onClick={() => openEdit(s.id)}>
                      EDYTUJ INSTRUKCJĘ
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  index,
  block,
  formatMode,
  folders,
  onFolders,
  onAssigned,
}: {
  index: number;
  block: { id?: string; prompt: string; negative: string };
  formatMode: "together" | "separate";
  folders: { id: string; name: string }[];
  onFolders: (f: { id: string; name: string }[]) => void;
  onAssigned: () => Promise<void>;
}) {
  const [openRate, setOpenRate] = useState(false);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const assigning = useRef(false);
  const words = block.prompt.trim().split(/\s+/).filter(Boolean).length;
  const full = block.negative ? `${block.prompt}\n\nNegative prompt: ${block.negative}` : block.prompt;
  const ghostBtn: CSSProperties = {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: "0.08em",
    padding: "4px 10px",
    color: T.text,
    background: "transparent",
    border: `1px solid ${T.line2}`,
  };

  async function assignFolder(folderId: string) {
    if (!block.id || assigning.current) return;
    assigning.current = true;
    setFolderBusy(true);
    try {
      await authFetch(`/api/prompts/${block.id}`, { method: "PATCH", body: JSON.stringify({ folderId }) });
      await onAssigned();
    } finally {
      assigning.current = false;
      setFolderBusy(false);
    }
  }

  async function createAndAssign() {
    const name = folderName.trim();
    if (!name || !block.id || assigning.current) return;
    assigning.current = true;
    setFolderBusy(true);
    try {
      const json = await authFetch("/api/folders", { method: "POST", body: JSON.stringify({ name }) });
      onFolders([json.folder, ...folders.filter((f) => f.id !== json.folder.id)]);
      await authFetch(`/api/prompts/${block.id}`, { method: "PATCH", body: JSON.stringify({ folderId: json.folder.id }) });
      await onAssigned();
      setFolderModal(false);
      setFolderName("");
    } finally {
      assigning.current = false;
      setFolderBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 16, border: `1px solid ${T.line}`, background: T.panel }}>
      {folderModal && (
        <StudioModal title="NOWY FOLDER" onClose={() => !folderBusy && setFolderModal(false)}>
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Nazwa folderu"
            onKeyDown={(e) => {
              if (e.key === "Enter") void createAndAssign();
            }}
            style={{
              width: "100%",
              fontFamily: MONO,
              fontSize: 13,
              background: T.bg,
              color: T.text,
              border: `1px solid ${T.line2}`,
              padding: 10,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={ghostBtn} disabled={folderBusy} onClick={() => setFolderModal(false)}>
              ANULUJ
            </button>
            <button
              type="button"
              disabled={folderBusy || !folderName.trim()}
              onClick={() => void createAndAssign()}
              style={{ ...ghostBtn, borderColor: T.red, color: T.red }}
            >
              ZAPISZ
            </button>
          </div>
        </StudioModal>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <span style={{ fontSize: 11, color: T.red, letterSpacing: "0.08em" }}>
          &gt;_ {String(index).padStart(2, "0")}
          <span style={{ color: T.muted, marginLeft: 10 }}>{words} słów</span>
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            defaultValue=""
            style={{ fontFamily: MONO, fontSize: 10, background: T.bg, color: T.text, border: `1px solid ${T.line2}`, padding: "3px 6px", colorScheme: "dark" }}
            onChange={async (e) => {
              const val = e.target.value;
              e.target.value = "";
              if (!val || !block.id || folderBusy) return;
              if (val === "__new") {
                setFolderModal(true);
                return;
              }
              await assignFolder(val);
            }}
          >
            <option value="">+ Dodaj do folderu</option>
            <option value="__new">+ nowy folder…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button type="button" style={ghostBtn} onClick={() => navigator.clipboard.writeText(formatMode === "together" ? full : block.prompt)}>
            KOPIUJ
          </button>
          {formatMode === "separate" && block.negative && (
            <button type="button" style={ghostBtn} onClick={() => navigator.clipboard.writeText(block.negative)}>
              KOPIUJ NEGATIVE
            </button>
          )}
        </div>
      </div>
      <pre style={{ padding: 12, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.75, margin: 0 }}>{block.prompt}</pre>
      {block.negative && formatMode === "together" && (
        <div style={{ padding: "0 12px 12px" }}>
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.14em", marginBottom: 4 }}>NEGATIVE</div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, margin: 0, color: T.muted }}>{block.negative}</pre>
        </div>
      )}
      <div style={{ padding: "6px 12px", borderTop: `1px solid ${T.line}`, background: T.panel2 }}>
        {!openRate ? (
          <button
            type="button"
            onClick={() => setOpenRate(true)}
            style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, background: "none", border: "none" }}
          >
            oceń render
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "6px 0" }}>
            <Chip
              active={false}
              onClick={() =>
                block.id &&
                authFetch("/api/ratings", { method: "POST", body: JSON.stringify({ promptId: block.id, verdict: "pass", tags: [] }) })
              }
            >
              PASS
            </Chip>
            {ERROR_TAGS.map((tag) => (
              <Chip
                key={tag}
                danger
                onClick={() =>
                  block.id &&
                  authFetch("/api/ratings", {
                    method: "POST",
                    body: JSON.stringify({ promptId: block.id, verdict: "fail", tags: [tag] }),
                  })
                }
              >
                {tag}
              </Chip>
            ))}
            <button type="button" onClick={() => setOpenRate(false)} style={{ fontFamily: MONO, fontSize: 9.5, color: T.muted, background: "none", border: "none" }}>
              zwiń
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
