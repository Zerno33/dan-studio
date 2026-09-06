"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ALLOWED_MODELS } from "@/lib/models";
import { calculateCreditCost } from "@/lib/credits";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Tab = "konsola" | "konto" | "biblioteka" | "nauczyciel" | "admin";
type AdminView = "payouts" | "users" | "cost" | "systems" | "ratings";

const ADMIN_VIEWS: { id: AdminView; l: string }[] = [
  { id: "payouts", l: "WYPŁATY" },
  { id: "users", l: "USERZY" },
  { id: "cost", l: "KOSZT" },
  { id: "systems", l: "SYSTEMY" },
  { id: "ratings", l: "OCENY" },
];

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
    const looksImage =
      !f.type ||
      f.type.startsWith("image/") ||
      f.type === "application/octet-stream" ||
      /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(f.name);
    if (!looksImage) continue;
    const key = `${f.size}:${f.name || f.type || "image"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function filesFromDrop(dt: DataTransfer): File[] {
  const raw: File[] = [];
  if (dt.files?.length) raw.push(...Array.from(dt.files));
  if (dt.items?.length) {
    for (const it of Array.from(dt.items)) {
      if (it.kind !== "file") continue;
      const f = it.getAsFile();
      if (f) raw.push(f);
    }
  }
  return uniqueImageFiles(raw);
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

function formatPaidWhen(iso: string | null | undefined) {
  if (!iso) return "brak godziny (stary ticket)";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "brak godziny (stary ticket)";
  return when.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function formatCostDay(day: string) {
  const when = new Date(day);
  if (Number.isNaN(when.getTime())) return day;
  return when.toLocaleDateString("pl-PL");
}

type CreditRow = {
  id: string;
  at: string;
  delta: number;
  reason: string;
  systemSlug?: string | null;
  model?: string | null;
};

function creditReasonLabel(row: CreditRow) {
  if (row.reason === "generation") return row.systemSlug ? `Generacja ${row.systemSlug.toUpperCase()}` : "Generacja";
  if (row.reason === "generation_failed") return "Nieukończone — zwrot";
  if (row.reason === "starter") return "Start konta";
  if (row.reason === "admin_grant" || row.reason === "mor_topup") return "Doładowanie";
  return row.reason;
}

function formatLedgerWhen(iso: string) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function StudioModal({
  title,
  children,
  onClose,
  maxWidth = 420,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: number;
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
          maxWidth,
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
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("Za duże zdjęcia na jeden strzał. Daj mniej plików albo mniejsze rozdzielczości.");
    }
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

function fileToImage(file: File): Promise<{ id: string; base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Nie udało się zmniejszyć zdjęcia."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      const base64 = dataUrl.split(",")[1] || "";
      resolve({ id: Math.random().toString(36).slice(2, 10), base64, mime: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = () => {
        const probe = new Image();
        probe.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(probe.width, probe.height, 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(probe.width * scale));
          canvas.height = Math.max(1, Math.round(probe.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Nie udało się zmniejszyć zdjęcia."));
            return;
          }
          ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
          resolve({ id: Math.random().toString(36).slice(2, 10), base64: dataUrl.split(",")[1] || "", mime: "image/jpeg" });
        };
        probe.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
        probe.src = String(reader.result || "");
      };
      reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
      reader.readAsDataURL(file);
    };
    img.src = url;
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
      className="peChip"
      onClick={onClick}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.06em",
        color: active ? "#0A0A0A" : T.text,
        background: active ? (danger ? T.red : "#FFFFFF") : "transparent",
        border: `1px solid ${active ? "#FFFFFF" : T.line2}`,
        padding: "4px 10px",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 80ms ease, background 80ms ease",
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
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
      b: "Czerwony przycisk w górnym pasku konsoli. Zużywa kredyty. Wynik to tekst do kopiowania, nie obraz.",
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
  const [myUserId, setMyUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referredCount, setReferredCount] = useState(0);
  const [teacherStats, setTeacherStats] = useState<{
    referrals: { id: string; email: string; status: string; commission: number }[];
    activeCount: number;
    commissionTotal: number;
    payoutDueUsd?: number;
    payoutPending: boolean;
    payoutStatus?: "pending" | "in_transit" | null;
    payoutRequestUsd?: number;
    payoutHistory?: { id: string; usd: number; paidAt: string | null }[];
  } | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState("");
  const [payouts, setPayouts] = useState<
    {
      id: string;
      teacher_id?: string;
      email: string;
      status: string;
      created_at: string;
      owedUsd?: number;
      requestedUsd?: number;
      earnedUsd?: number;
      paidUsd?: number;
      paidAt?: string | null;
    }[]
  >([]);
  const [payoutLoadErr, setPayoutLoadErr] = useState("");
  const [payoutCashflow, setPayoutCashflow] = useState<{
    owedTotalUsd: number;
    pendingCount: number;
    inTransitCount?: number;
  } | null>(null);
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
  const [blocks, setBlocks] = useState<
    { id?: string; prompt: string; negative: string; preview?: string | null; error?: string; pending?: boolean }[]
  >([]);
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCredits, setInviteCredits] = useState("10");
  const [payoutHistoryOpen, setPayoutHistoryOpen] = useState(false);
  const [adminView, setAdminView] = useState<AdminView>("payouts");
  const [creditLedger, setCreditLedger] = useState<CreditRow[]>([]);
  const [ledgerBusy, setLedgerBusy] = useState(false);

  const current = systems.find((s) => s.slug === systemSlug);
  const isR1 = systemSlug === "r1";
  const isAnalyze = isR1 && (variant === "analyze" || variant === "repair");
  const showDrop = !(systemSlug === "n1" && mode === "prompt");
  const maxImgs = isR1 || systemSlug === "s1" ? 1 : 10;

  const previewCost = useMemo(() => {
    if (!current) return 0;
    const model = modelOverride || current.model || "";
    return calculateCreditCost(
      { systemSlug, mode, images, variant, count, lengthMode },
      model
    );
  }, [current, systemSlug, mode, images, variant, count, lengthMode, modelOverride]);

  useEffect(() => {
    (async () => {
      try {
        const me = await authFetch("/api/me");
        setEmail(me.user.email || "");
        setMyUserId(me.user.id || "");
        setIsAdmin(me.user.isAdmin);
        setReferralCode(me.user.referralCode || "");
        setReferredCount(me.referredCount || 0);
        if (!me.user.onboardingCompletedAt) setShowOnboard(true);
        setCredits(me.credits);
        const urlRef = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
        if (urlRef?.trim()) localStorage.setItem("brns_ref", urlRef.trim().toLowerCase());
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
        if (me.user.isAdmin) await loadAdminShell();
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
      const n1Batch = systemSlug === "n1" && mode === "img" && images.length > 0;
      if (n1Batch) {
        const slots = images.map((img, i) => ({
          prompt: "",
          negative: "",
          preview: sourcePreviews[i] || `data:${img.mime};base64,${img.base64}`,
          pending: true,
        }));
        setBlocks(slots);
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            const json = await authFetch("/api/generate", {
              method: "POST",
              body: JSON.stringify({
                systemSlug,
                mode: "img",
                images: [{ base64: img.base64, mime: img.mime }],
                sourcePreviews: [sourcePreviews[i]],
                brief,
                lengthMode,
                modelOverride: modelOverride || undefined,
                formatMode,
              }),
            });
            const b = json.blocks?.[0];
            setBlocks((prev) => {
              const next = [...prev];
              next[i] = {
                id: b?.id,
                prompt: b?.prompt || "",
                negative: b?.negative || "",
                preview: slots[i].preview,
                pending: false,
              };
              return next;
            });
            if (typeof json.creditsRemaining === "number") setCredits(json.creditsRemaining);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Błąd slotu.";
            setBlocks((prev) => {
              const next = [...prev];
              next[i] = { prompt: "", negative: "", preview: slots[i].preview, pending: false, error: msg };
              return next;
            });
          }
        }
      } else {
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
        setBlocks(
          (json.blocks || []).map((b: { id?: string; prompt: string; negative: string }, i: number) => ({
            ...b,
            preview: sourcePreviews[i] || sourcePreviews[0] || null,
          }))
        );
        if (typeof json.creditsRemaining === "number") setCredits(json.creditsRemaining);
      }
    } catch (e: any) {
      setError(e.message || "Błąd generacji.");
    } finally {
      setBusy(false);
    }
  }

  async function loadLibrary() {
    try {
      const json = await authFetch("/api/prompts");
      const rows: any[] = json.prompts || [];
      const byId = new Map<string, any>();
      for (const p of rows) {
        if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
      }
      setLibrary(byId.size ? [...byId.values()] : rows);
    } catch (e: any) {
      setLoadErr(e.message || "Nie wczytano biblioteki.");
    }
  }

  async function loadAdminShell() {
    const [sys, users, cost, pay, ratings] = await Promise.all([
      authFetch("/api/admin/systems?meta=1"),
      authFetch("/api/admin/users"),
      authFetch("/api/admin/cost-summary"),
      authFetch("/api/admin/payouts").catch((e: unknown) => ({
        payouts: [] as typeof payouts,
        cashflow: null,
        error: e instanceof Error ? e.message : "Nie wczytano wypłat.",
      })),
      authFetch("/api/admin/ratings-summary").catch(() => ({ summary: {} })),
    ]);
    setAdminSystems(sys.systems || []);
    setAdminUsers(users.users || []);
    setCostSummary(cost);
    setPayouts(pay.payouts || []);
    setPayoutCashflow(pay.cashflow || users.cashflow || null);
    setPayoutLoadErr(pay.listError || pay.error || "");
    setRatingsSummary(ratings.summary || {});
    setEditId(null);
    setEditPrompt("");
  }

  async function loadTeacher() {
    const json = await authFetch("/api/referrals");
    setTeacherStats(json);
    setReferredCount((json.referrals || []).length);
  }

  async function loadLedger() {
    setLedgerBusy(true);
    try {
      const json = await authFetch("/api/me/credits");
      setCreditLedger(json.ledger || []);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Nie wczytano historii kredytów.");
    } finally {
      setLedgerBusy(false);
    }
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
      <style>{`
        @keyframes peSweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes pePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .peKonto { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 16px; align-items: start; }
        @media (max-width: 860px) { .peKonto { grid-template-columns: 1fr; } }
        .peAdminNavBtn:hover { color: #EDEDED !important; }
        .peWork { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); min-height: calc(100vh - 118px); }
        @media (max-width: 960px) { .peWork { grid-template-columns: 1fr; min-height: auto; } }
        .peJobs { overflow: auto; min-height: 420px; }
        .peJobGrid { display: flex; flex-direction: column; gap: 8px; }
        @media (min-width: 1320px) { .peJobGrid { display: grid; grid-template-columns: 1fr 1fr; align-items: start; } }
        .peLib { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 0; min-height: calc(100vh - 86px); border: 1px solid #272727; }
        @media (max-width: 860px) { .peLib { grid-template-columns: 1fr; } }
        .peChip:hover { border-color: #EDEDED !important; }
        .peBusyBar { height: 2px; background: linear-gradient(90deg, transparent, #E5152A, transparent); animation: peSweep 1.2s linear infinite; }
      `}</style>
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
          {adminModal.kind === "credits" && (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, lineHeight: 1.6 }}>
              Generacje nie liczą prowizji. Wpłata na betę = doładuj 900 / 1200 / … / 3000 kr ($3–$10). 900 kr = $0.60 dla nauczyciela.
            </div>
          )}
          <input
            autoFocus
            value={adminModal.value}
            onChange={(e) => setAdminModal({ ...adminModal, value: e.target.value })}
            placeholder={adminModal.kind === "credits" ? "900" : "ania"}
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
                try {
                  if (adminModal.kind === "credits") {
                    const amount = Number(String(adminModal.value).replace(",", "."));
                    if (!Number.isFinite(amount) || amount === 0) return;
                    const json = await authFetch(`/api/admin/users/${adminModal.userId}/credits`, {
                      method: "POST",
                      body: JSON.stringify({ amount }),
                    });
                    if (json.commissionError) window.alert(json.commissionError);
                    else if (json.commissionAdded > 0) {
                      window.alert(`Doładowano. Prowizja nauczyciela +$${Number(json.commissionAdded).toFixed(2)}`);
                    }
                  } else {
                    await authFetch(`/api/admin/users/${adminModal.userId}/referral`, {
                      method: "POST",
                      body: JSON.stringify({ code: adminModal.value }),
                    });
                  }
                  setAdminModal(null);
                  await loadAdminShell();
                } catch (e: unknown) {
                  window.alert(e instanceof Error ? e.message : "Błąd zapisu.");
                }
              }}
            >
              ZAPISZ
            </button>
          </div>
        </StudioModal>
      )}
      {inviteOpen && (
        <StudioModal title="ZAPROŚ DO BETY" onClose={() => setInviteOpen(false)}>
          <input
            autoFocus
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email"
            style={{
              width: "100%",
              fontFamily: MONO,
              fontSize: 13,
              background: T.bg,
              color: T.text,
              border: `1px solid ${T.line2}`,
              padding: 10,
              marginBottom: 8,
            }}
          />
          <input
            value={inviteCredits}
            onChange={(e) => setInviteCredits(e.target.value)}
            placeholder="kredyty start"
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
            <button type="button" style={ghostBtn} onClick={() => setInviteOpen(false)}>
              ANULUJ
            </button>
            <button
              type="button"
              style={{ ...ghostBtn, borderColor: T.red, color: T.red }}
              onClick={async () => {
                await authFetch("/api/admin/invite", {
                  method: "POST",
                  body: JSON.stringify({ email: inviteEmail, credits: Number(inviteCredits) }),
                });
                setInviteOpen(false);
                setInviteEmail("");
                await loadAdminShell();
              }}
            >
              WYŚLIJ
            </button>
          </div>
        </StudioModal>
      )}
      {payoutHistoryOpen && (
        <StudioModal title="HISTORIA WYPŁAT" onClose={() => setPayoutHistoryOpen(false)} maxWidth={560}>
          <p style={{ fontSize: 11, color: T.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
            Data = moment kliknięcia zakończono. Kwota i nauczyciel.
          </p>
          <div style={{ display: "flex", fontSize: 10, color: T.muted, letterSpacing: "0.08em", marginBottom: 8, gap: 8 }}>
            <span style={{ width: 140, flexShrink: 0 }}>KIEDY</span>
            <span style={{ flex: 1 }}>DO KOGO</span>
            <span style={{ width: 90, textAlign: "right" }}>ILE</span>
          </div>
          {payouts.filter((p) => p.status === "done").length === 0 && (
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Brak zakończonych wypłat.</p>
          )}
          {payouts
            .filter((p) => p.status === "done")
            .slice()
            .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")))
            .map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  fontSize: 12,
                  padding: "8px 0",
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <span style={{ width: 140, flexShrink: 0, color: T.muted }}>{formatPaidWhen(p.paidAt)}</span>
                <span style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>{p.email}</span>
                <span style={{ width: 90, textAlign: "right", color: T.green }}>
                  ${Number(p.requestedUsd || 0).toFixed(2)}
                </span>
              </div>
            ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" style={ghostBtn} onClick={() => setPayoutHistoryOpen(false)}>
              ZAMKNIJ
            </button>
          </div>
        </StudioModal>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          height: 52,
          borderBottom: `1px solid ${T.line}`,
          position: "sticky",
          top: 0,
          background: T.bg,
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: 14, letterSpacing: "0.14em", color: T.red, flexShrink: 0 }}>PROMPT_ENGINE</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
          {(
            ["konsola", "konto", "biblioteka", ...(referralCode ? (["nauczyciel"] as const) : []), ...(isAdmin ? (["admin"] as const) : [])] as Tab[]
          ).map((t) => (
            <Chip
              key={t}
              active={tab === t}
              onClick={async () => {
                setTab(t);
                if (t === "biblioteka") await loadLibrary();
                if (t === "nauczyciel") await loadTeacher();
                if (t === "admin") await loadAdminShell();
                if (t === "konto") await loadLedger();
              }}
            >
              {t === "admin" && payouts.filter((p) => p.status !== "done").length
                ? `ADMIN · ${payouts.filter((p) => p.status !== "done").length}`
                : t.toUpperCase()}
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <span style={{ fontSize: 10, color: T.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {email}
            {isAdmin ? " · admin" : ""}
          </span>
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

      <div style={{ width: "100%", padding: tab === "konsola" ? 0 : "16px 20px", boxSizing: "border-box" }}>
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
                marginBottom: 0,
                border: "none",
                borderBottom: `1px solid ${T.line}`,
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
                    fontSize: 12,
                    letterSpacing: "0.1em",
                    background: busy ? T.line2 : T.red,
                    color: "#fff",
                    border: "none",
                    padding: "10px 22px",
                    cursor: busy ? "wait" : "pointer",
                    animation: busy ? "pePulse 1.1s ease-in-out infinite" : undefined,
                  }}
                >
                  {busy ? "PRACUJE…" : "URUCHOM"}
                </button>
              </div>
            </div>

            <div className="peWork">
            <div
              style={{
                borderRight: `1px solid ${T.line}`,
                background: T.panel,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                minHeight: 0,
              }}
            >
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
              <div style={{ flex: 1, minHeight: 220 }}>
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
                    const got = filesFromDrop(e.dataTransfer);
                    if (got.length) await addFiles(got);
                  }}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignContent: "flex-start",
                    minHeight: 240,
                    padding: 12,
                    border: `1px dashed ${dragOver ? T.red : T.line2}`,
                    background: T.bg,
                  }}
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
                        width: images.length ? 112 : "100%",
                        height: images.length ? 146 : 216,
                        border: `1px dashed ${dragOver ? T.red : T.line2}`,
                        background: T.panel,
                        color: T.muted,
                        fontSize: images.length ? 20 : 13,
                        letterSpacing: "0.08em",
                        cursor: "pointer",
                      }}
                    >
                      {images.length ? "+" : "Upuść zdjęcia albo Ctrl+V"}
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
            {error && (
              <div style={{ padding: 12, border: `1px solid ${T.red}`, color: T.red, fontSize: 11 }}>
                {error}
              </div>
            )}
            </div>

            <div className="peJobs" style={{ display: "flex", flexDirection: "column", background: T.bg, minHeight: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${T.line}`,
                  background: T.panel,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, letterSpacing: "0.12em", color: T.red }}>
                  JOBY
                  {blocks.length ? ` · ${blocks.filter((b) => !b.pending).length}/${blocks.length}` : ""}
                </span>
                <span style={{ fontSize: 11, color: T.muted }}>
                  {busy ? "pracuje…" : blocks.length ? `${blocks.filter((b) => b.error).length} blokad` : "pusto"}
                </span>
              </div>
              {busy && <div className="peBusyBar" />}
              <div className="peJobGrid" style={{ padding: 12, flex: 1 }}>
              {blocks.map((b, i) => (
                <ResultCard
                  key={b.id || `slot-${i}`}
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
                    minHeight: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${T.line}`,
                    background: T.panel,
                    color: T.muted,
                    fontSize: 12,
                    lineHeight: 1.8,
                    textAlign: "center",
                    padding: 32,
                  }}
                >
                  Lewa szyna: wrzuć inspiracje albo wklej prompt.
                  <br />
                  URUCHOM zapełni tę kolumnę slotami — jeden obraz = jeden job.
                </div>
              )}
            </div>
            </div>
            </div>
          </>
        )}

        {tab === "konto" && (
          <div>
            <div className="peKonto">
              <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.muted }}>SALDO</div>
                <div style={{ fontSize: 42, lineHeight: 1.1, margin: "12px 0 8px", color: (credits ?? 0) > 20 ? T.green : T.red }}>
                  {credits ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>kredytów</div>
                <div style={{ fontSize: 12, wordBreak: "break-all" }}>{email || "—"}</div>
                <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, margin: "16px 0 0" }}>
                  Konsola zwraca tekst do kopiowania. Start: 10 kr. Ceny USD nie są tu pokazywane.
                </p>
                <a href="/terms" style={{ display: "inline-block", marginTop: 16, fontSize: 11, color: T.red }}>
                  Terms of Use
                </a>
              </div>
              <div style={{ border: `1px solid ${T.line}`, background: T.panel, minHeight: 320 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "14px 16px",
                    borderBottom: `1px solid ${T.line}`,
                  }}
                >
                  <span style={{ fontSize: 11, letterSpacing: "0.12em", color: T.red }}>ZUŻYCIE</span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    {ledgerBusy
                      ? "ładuję…"
                      : `${creditLedger.filter((r) => r.reason === "generation").length} gen · ${creditLedger
                          .filter((r) => r.delta < 0)
                          .reduce((s, r) => s + Math.abs(r.delta), 0)} kr zużyte`}
                  </span>
                </div>
                {ledgerBusy && !creditLedger.length && (
                  <div style={{ padding: 16, color: T.muted, fontSize: 12, animation: "pePulse 1.1s ease-in-out infinite" }}>
                    Wczytuję historię…
                  </div>
                )}
                {!ledgerBusy && creditLedger.length === 0 && (
                  <div style={{ padding: 16, color: T.muted, fontSize: 12, lineHeight: 1.7 }}>
                    Tu pojawi się historia kredytów po pierwszej generacji albo doładowaniu.
                  </div>
                )}
                {creditLedger.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "baseline",
                      padding: "10px 16px",
                      borderBottom: `1px solid ${T.line}`,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ width: 132, flexShrink: 0, color: T.muted }}>{formatLedgerWhen(row.at)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {creditReasonLabel(row)}
                      {row.model ? <span style={{ color: T.muted }}> · {row.model}</span> : null}
                    </span>
                    <span
                      style={{
                        width: 72,
                        textAlign: "right",
                        color: row.delta > 0 ? T.green : row.delta < 0 ? T.red : T.muted,
                      }}
                    >
                      {row.delta === 0 ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta} kr`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "biblioteka" && (
          <div className="peLib">
            <aside style={{ borderRight: `1px solid ${T.line}`, background: T.panel2, padding: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.muted, padding: "6px 8px 12px" }}>FOLDERY</div>
              <Chip active={activeFolder === "all"} onClick={() => setActiveFolder("all")}>
                WSZYSTKIE ({library.length})
              </Chip>
              <div style={{ height: 8 }} />
              <Chip active={activeFolder === "none"} onClick={() => setActiveFolder("none")}>
                BEZ FOLDERU
              </Chip>
              <div style={{ height: 8 }} />
              {folders.map((f) => (
                <div key={f.id} style={{ marginBottom: 8 }}>
                  <Chip active={activeFolder === f.id} onClick={() => setActiveFolder(f.id)}>
                    {f.name}
                  </Chip>
                </div>
              ))}
              <div style={{ height: 8 }} />
              <Chip active={false} onClick={() => setLibFolderOpen(true)}>
                + FOLDER
              </Chip>
            </aside>
            <div style={{ padding: 16, overflow: "auto" }}>
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
                      <button
                        type="button"
                        style={ghostBtn}
                        onClick={async () => {
                          await authFetch(`/api/prompts/${p.id}`, { method: "DELETE" });
                          await loadLibrary();
                        }}
                      >
                        USUŃ
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
          </div>
        )}

        {tab === "nauczyciel" && referralCode && (
          <div className="peKonto">
            <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.red, marginBottom: 12 }}>AFILIACJA</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: T.muted }}>
                Kod: <span style={{ color: T.text }}>{referralCode}</span>
                <br />
                Poleceni: {teacherStats?.referrals.length ?? referredCount} · aktywni: {teacherStats?.activeCount ?? "—"}
                <br />
                Prowizja wyrobiona: ${Number(teacherStats?.commissionTotal ?? 0).toFixed(2)} USD
                <br />
                Do wypłaty: ${Number(teacherStats?.payoutDueUsd ?? 0).toFixed(2)} USD
                <br />
                Dostajesz 20% od doładowań osób z Twojego linku.
              </p>
              {teacherStats?.payoutPending && (
                <div style={{ margin: "12px 0 4px" }}>
                  <div style={{ fontSize: 11, color: T.text, marginBottom: 8 }}>
                    {teacherStats.payoutStatus === "in_transit"
                      ? "Przelew w realizacji"
                      : "Wypłata zgłoszona — czekamy na przelew"}
                    {teacherStats.payoutRequestUsd != null
                      ? ` · $${Number(teacherStats.payoutRequestUsd).toFixed(2)}`
                      : ""}
                  </div>
                  <div style={{ display: "flex", gap: 4, height: 6 }}>
                    <div style={{ flex: 1, background: T.red }} />
                    <div
                      style={{
                        flex: 1,
                        background: teacherStats.payoutStatus === "in_transit" ? T.red : T.line2,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.muted, marginTop: 4 }}>
                    <span>Zgłoszone</span>
                    <span>W realizacji</span>
                  </div>
                </div>
              )}
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
                disabled={teacherStats?.payoutPending || payoutBusy || !(Number(teacherStats?.payoutDueUsd) > 0)}
                onClick={async () => {
                  setPayoutBusy(true);
                  setPayoutMsg("");
                  try {
                    await authFetch("/api/referrals", { method: "POST" });
                    setPayoutMsg("Zgłoszenie przyjęte.");
                    await loadTeacher();
                  } catch (e: unknown) {
                    const raw = e instanceof Error ? e.message : "Nie wysłano zgłoszenia.";
                    setPayoutMsg(
                      /note|amount|schema|column|null value/i.test(raw)
                        ? "Nie udało się zgłosić wypłaty. Spróbuj za chwilę."
                        : raw
                    );
                  } finally {
                    setPayoutBusy(false);
                  }
                }}
              >
                {payoutBusy ? "WYSYŁAM…" : teacherStats?.payoutPending ? "WYPŁATA W TOKU" : "ZLEĆ WYPŁATĘ"}
              </button>
              {payoutMsg && !teacherStats?.payoutPending && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>{payoutMsg}</div>
              )}
            </div>
            <div style={{ border: `1px solid ${T.line}`, background: T.panel, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", color: T.muted, marginBottom: 12 }}>HISTORIA WYPŁAT</div>
              {!(teacherStats?.payoutHistory || []).length && (
                <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Tu widać datę i kwotę, gdy przelew jest zakończony.</p>
              )}
              {(teacherStats?.payoutHistory || []).map((h) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontSize: 12,
                        padding: "8px 0",
                        borderBottom: `1px solid ${T.line}`,
                      }}
                    >
                      <span style={{ color: T.muted }}>{formatPaidWhen(h.paidAt)}</span>
                      <span>${Number(h.usd).toFixed(2)} USD</span>
                    </div>
                  ))}
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
                <span style={{ color: T.muted }}>
                  ${Number(r.commission || 0).toFixed(2)} · {r.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "admin" && isAdmin && (
          <section
            style={{
              display: "flex",
              minHeight: "calc(100vh - 52px)",
              border: `1px solid ${T.line}`,
              background: T.panel,
            }}
          >
            <aside
              style={{
                width: 188,
                flexShrink: 0,
                borderRight: `1px solid ${T.line}`,
                background: T.panel2,
                padding: "12px 10px",
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.16em", color: T.muted, padding: "6px 8px 14px" }}>ADMIN</div>
              {ADMIN_VIEWS.map((v) => {
                const open = v.id === "payouts" ? payouts.filter((p) => p.status !== "done").length : 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setAdminView(v.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      padding: "10px 10px",
                      marginBottom: 4,
                      cursor: "pointer",
                      color: adminView === v.id ? T.text : T.muted,
                      background: adminView === v.id ? T.bg : "transparent",
                      border: `1px solid ${adminView === v.id ? T.red : "transparent"}`,
                    }}
                  >
                    {open ? `${v.l} · ${open}` : v.l}
                  </button>
                );
              })}
            </aside>
            <div style={{ flex: 1, minWidth: 0, padding: 20 }}>
            {adminView === "payouts" && (
              <>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>WYPŁATY</h2>
            <div style={{ fontSize: 16, margin: "8px 0 6px", color: T.green }}>
              ${Number(payoutCashflow?.owedTotalUsd ?? 0).toFixed(2)} USD winne łącznie
            </div>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.6 }}>
              Ticket od nauczyciela (ZLEĆ WYPŁATĘ). Status: pending → w drodze → zakończono.
            </p>
            <button type="button" style={{ ...ghostBtn, marginBottom: 16 }} onClick={() => setPayoutHistoryOpen(true)}>
              HISTORIA WYPŁAT
            </button>
            {payoutLoadErr && (
              <p style={{ fontSize: 11, color: T.red, marginBottom: 12 }}>{payoutLoadErr}</p>
            )}
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>TICKETY</h2>
            {payouts.filter((p) => p.status !== "done").length === 0 && (
              <p style={{ color: T.muted, fontSize: 11, marginBottom: 16 }}>Brak otwartych zgłoszeń.</p>
            )}
            {payouts
              .filter((p) => p.status !== "done")
              .map((p) => (
                <div
                  key={p.id}
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
                  <span>{p.email}</span>
                  <span style={{ color: T.green }}>${Number(p.requestedUsd || p.owedUsd || 0).toFixed(2)}</span>
                  <select
                    value={p.status === "in_transit" ? "in_transit" : p.status === "done" ? "done" : "pending"}
                    onChange={async (e) => {
                      await authFetch("/api/admin/payouts", {
                        method: "POST",
                        body: JSON.stringify({ id: p.id, status: e.target.value }),
                      });
                      await loadAdminShell();
                    }}
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      background: T.bg,
                      color: T.text,
                      border: `1px solid ${T.line2}`,
                      padding: "6px 8px",
                    }}
                  >
                    <option value="pending">pending</option>
                    <option value="in_transit">w drodze</option>
                    <option value="done">zakończono</option>
                  </select>
                </div>
              ))}

              </>
            )}

            {adminView === "users" && (
              <>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>USERZY</h2>
            <button type="button" style={{ ...ghostBtn, marginBottom: 10 }} onClick={() => setInviteOpen(true)}>
              ZAPROŚ MAILEM
            </button>
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
                <span style={{ color: T.muted, fontSize: 10 }}>kod {u.referral_code || "—"}</span>
                <span style={{ color: T.muted, fontSize: 10 }}>od {u.referred_by || "—"}</span>
                {Number(u.teacherOwedUsd) > 0 && (
                  <span style={{ color: T.green, fontSize: 10 }}>${Number(u.teacherOwedUsd).toFixed(2)} winne</span>
                )}
                {payouts.some((p) => p.teacher_id === u.id && p.status !== "done") && (
                  <span style={{ color: T.red, fontSize: 10 }}>ticket</span>
                )}
                <select
                  defaultValue=""
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    background: T.bg,
                    color: T.text,
                    border: `1px solid ${T.line2}`,
                    padding: "4px 6px",
                    colorScheme: "dark",
                    marginLeft: "auto",
                  }}
                  onChange={async (e) => {
                    const val = e.target.value;
                    e.target.value = "";
                    if (val === "credits") {
                      setAdminModal({ kind: "credits", userId: u.id, email: u.email, value: "900" });
                    } else if (val === "ref") {
                      setAdminModal({ kind: "ref", userId: u.id, email: u.email, value: u.referral_code || "" });
                    } else if (val === "ban") {
                      await authFetch(`/api/admin/users/${u.id}/ban`, {
                        method: "POST",
                        body: JSON.stringify({ banned: !u.is_banned }),
                      });
                      await loadAdminShell();
                    } else if (val === "delete" && u.id !== myUserId) {
                      const mail = u.email || u.id;
                      if (!window.confirm(`Na zawsze skasować ${mail}? Mail wróci do puli. Tego nie cofniesz.`)) return;
                      if (!window.confirm("Na pewno? Znikną prompty, kredyty i konto Auth.")) return;
                      await authFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
                      await loadAdminShell();
                    }
                  }}
                >
                  <option value="">akcja</option>
                  <option value="credits">Kredyty</option>
                  <option value="ref">Kod ref</option>
                  <option value="ban">{u.is_banned ? "Odbanuj" : "Ban"}</option>
                  {u.id !== myUserId && <option value="delete">Usuń konto</option>}
                </select>
              </div>
            ))}

              </>
            )}

            {adminView === "cost" && (
              <>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>KOSZT</h2>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
              USD {costSummary?.summary?.totalCostUsd ?? "—"} · kredyty {costSummary?.summary?.totalCreditsSpent ?? "—"}
              {costSummary?.summary?.blendMarginPct != null ? ` · marża ${costSummary.summary.blendMarginPct}%` : ""}
              {costSummary?.summary?.marginWarning ? " · UWAGA marża < 40%" : ""}
            </div>
            <p style={{ fontSize: 11, color: T.muted, margin: "0 0 8px", lineHeight: 1.5 }}>
              Suma za dzień, nie godzina pojedynczej generacji.
            </p>
            {(costSummary?.daily || []).slice(0, 14).map((d: { day: string; cost_usd?: number; credits_spent?: number }) => (
              <div key={d.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${T.line}` }}>
                <span>{formatCostDay(d.day)}</span>
                <span>
                  {d.cost_usd ?? 0} USD / {d.credits_spent ?? 0} kr
                </span>
              </div>
            ))}
            <h3 style={{ fontSize: 11, letterSpacing: "0.1em", color: T.muted, marginTop: 16 }}>GROK VS GPT</h3>
            {(costSummary?.byModel || []).map(
              (m: {
                model: string;
                generations: number;
                failed: number;
                creditsSpent: number;
                costUsd: number;
                marginPct?: number | null;
                marginLow?: boolean;
              }) => (
                <div
                  key={m.model}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${T.line}` }}
                >
                  <span>{m.model}</span>
                  <span>
                    {m.generations} gen · {m.failed} fail · {m.creditsSpent} kr · {Number(m.costUsd).toFixed(4)} USD
                    {m.marginPct != null ? ` · ${m.marginPct}%` : ""}
                    {m.marginLow ? " · nisko" : ""}
                  </span>
                </div>
              )
            )}
            {!(costSummary?.byModel || []).length && (
              <p style={{ color: T.muted, fontSize: 11 }}>Brak generacji z modelem w tym okresie.</p>
            )}

              </>
            )}

            {adminView === "ratings" && (
              <>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>OCENY</h2>
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

              </>
            )}

            {adminView === "systems" && (
              <>
            <h2 style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted }}>SYSTEMY</h2>
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
              </>
            )}
            </div>
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
  block: { id?: string; prompt: string; negative: string; preview?: string | null; error?: string; pending?: boolean };
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
    <div style={{ marginBottom: 0, height: "100%", border: `1px solid ${T.line}`, background: T.panel }}>
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
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {(block.preview || block.pending || block.error) && (
          <div
            style={{
              width: 72,
              flexShrink: 0,
              position: "relative",
              overflow: "hidden",
              borderRight: `1px solid ${T.line}`,
              background: T.panel2,
            }}
          >
            {block.preview ? (
              <img
                src={block.preview}
                alt=""
                style={{ width: "100%", height: "100%", minHeight: 96, objectFit: "cover", opacity: block.pending ? 0.4 : 0.92 }}
              />
            ) : (
              <div style={{ minHeight: 96 }} />
            )}
            {block.pending && (
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(90deg, transparent, rgba(229,21,42,0.4), transparent)",
                    animation: "peSweep 1.15s linear infinite",
                  }}
                />
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
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
          <span style={{ color: T.muted, marginLeft: 10 }}>
            {block.pending ? "pracuje" : block.error ? "blokada" : `${words} słów`}
          </span>
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!block.pending && !block.error && (
            <>
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
            </>
          )}
        </div>
      </div>
      {block.pending ? (
        <div style={{ padding: 12, fontSize: 11, color: T.muted, animation: "pePulse 1.1s ease-in-out infinite" }}>
          Generuję ten slot…
        </div>
      ) : block.error ? (
        <div style={{ padding: 12, fontSize: 11, color: T.red, lineHeight: 1.6 }}>{block.error}</div>
      ) : (
        <>
      <pre style={{ padding: 12, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.75, margin: 0 }}>{block.prompt}</pre>
      {block.negative && formatMode === "together" && (
        <div style={{ padding: "0 12px 12px" }}>
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.14em", marginBottom: 4 }}>NEGATIVE</div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, margin: 0, color: T.muted }}>{block.negative}</pre>
        </div>
      )}
        </>
      )}
      {!block.pending && !block.error && (
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
      )}
        </div>
      </div>
    </div>
  );
}
