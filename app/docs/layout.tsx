import Link from "next/link";
import { DocsNav } from "./ui";
import "./docs.css";

export const metadata = {
  title: { default: "Pomoc", template: "%s — PROMPT_ENGINE" },
  description: "Jak działa PROMPT_ENGINE: konsola, systemy N1 / S1 / R1, kredyty.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <aside className="docs-side">
        <Link href="/docs" className="docs-brand">
          PROMPT_ENGINE
        </Link>
        <p className="docs-brand-sub">Pomoc — jak korzystać</p>
        <DocsNav />
        <div className="docs-side-foot">
          <Link href="/login">Konsola</Link>
          <Link href="/terms">Regulamin</Link>
        </div>
      </aside>
      <div className="docs-main">{children}</div>
    </div>
  );
}
