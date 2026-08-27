import { Shot } from "../ui";

export const metadata = { title: "R1" };

export default function DocsR1() {
  return (
    <article>
      <p className="docs-kicker">Systemy</p>
      <h1>R1</h1>
      <p className="docs-lead">
        Praca na jednym zdjęciu bazowym. Dokładnie jeden plik — nie batch.
      </p>
      <Shot caption="R1: jedno zdjęcie, wariant, liczba." />
      <h2>Warianty</h2>
      <ul>
        <li>
          <b>ANALYZE / REPAIR</b> — jeden blok, bez mnożenia.
        </li>
        <li>
          <b>RESTYLE / ANGLE</b> — liczba 1–10, tyle bloków wraca.
        </li>
      </ul>
      <p>Długość edycji jest krótka (ok. dwóch zdań). Koszt: 1 kredyt za blok, bez mnożnika std/long.</p>
    </article>
  );
}
