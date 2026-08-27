import { Shot } from "../ui";

export const metadata = { title: "S1" };

export default function DocsS1() {
  return (
    <article>
      <p className="docs-kicker">Systemy</p>
      <h1>S1</h1>
      <p className="docs-lead">
        Scena od zera albo z referencji. Wystarczy obraz, brief, albo oba.
      </p>
      <Shot caption="S1: wrzutka zdjęcia i pole briefu." />
      <p>Bez zdjęcia i bez briefu system nie wystartuje. Długość działa tak samo jak w N1.</p>
      <p>Wynik: jeden blok promptu (plus negative, jeśli system go zwraca).</p>
    </article>
  );
}
