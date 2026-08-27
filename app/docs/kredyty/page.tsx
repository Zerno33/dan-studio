import { Shot } from "../ui";

export const metadata = { title: "Kredyty" };

export default function DocsKredyty() {
  return (
    <article>
      <p className="docs-kicker">Start</p>
      <h1>Kredyty</h1>
      <p className="docs-lead">
        Płacisz kredytami za każde Generuj. Klucz do modelu jest nasz — Ty nie wklejasz API key.
      </p>
      <h2>Ile schodzi</h2>
      <ul>
        <li>
          <b>R1</b> — 1 kredyt za blok (zawsze, bez mnożnika długości).
        </li>
        <li>
          <b>S1</b> — 2 kredyty × długość (krótki ×1, std ×1.5, długi ×2).
        </li>
        <li>
          <b>N1</b> — 2 kredyty × liczba bloków × długość. W trybie załączników: jeden blok na zdjęcie.
        </li>
      </ul>
      <Shot caption="Napis „Koszt tej operacji: X kredytów” nad Generuj." />
      <p className="docs-note">
        Pierwsze wejście przy zerowym saldzie dopisuje pulę startową (żeby dało się kliknąć bez
        płatności). Doładowania z karty przyjdą później.
      </p>
    </article>
  );
}
