import { Shot } from "../ui";

export const metadata = { title: "N1" };

export default function DocsN1() {
  return (
    <article>
      <p className="docs-kicker">Systemy</p>
      <h1>N1</h1>
      <p className="docs-lead">
        Neutralizacja i rozpisanie na czyste prompty. Dwa wejścia: zdjęcia albo wklejony prompt.
      </p>
      <Shot caption="Przełącznik ZAŁĄCZNIKI / PROMPT." />
      <h2>Załączniki</h2>
      <p>
        Wrzuć 1–10 inspiracji (png / jpg / webp). Dostajesz osobny blok na każde zdjęcie — bez
        mieszania scen.
      </p>
      <h2>Prompt</h2>
      <p>Wklejasz gotowy tekst. N1 czyści go i zwraca jeden blok do generatora obrazów.</p>
      <h2>Długość</h2>
      <p>Krótki / std / długi zmienia gęstość promptu i koszt kredytów. Brief na dole jest opcją.</p>
    </article>
  );
}
