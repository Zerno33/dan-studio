"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV } from "./nav";

export function DocsNav() {
  const path = usePathname();
  return (
    <nav className="docs-nav">
      {DOCS_NAV.map((group) => (
        <div key={group.title} className="docs-nav-group">
          <div className="docs-nav-title">{group.title}</div>
          {group.items.map((item) => {
            const active = path === item.href;
            return (
              <Link key={item.href} href={item.href} className={active ? "docs-nav-link active" : "docs-nav-link"}>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Shot({ caption }: { caption: string }) {
  return (
    <figure className="docs-shot">
      <div className="docs-shot-empty">Miejsce na screen</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
