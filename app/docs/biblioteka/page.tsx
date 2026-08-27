import { Shot } from "../ui";

export const metadata = { title: "Biblioteka" };

export default function DocsBiblioteka() {
  return (
    <article>
      <p className="docs-kicker">Dalej</p>
      <h1>Biblioteka</h1>
      <p className="docs-lead">
        Każde udane Generuj zapisuje bloki na konto. Zakładka Biblioteka pokazuje historię.
      </p>
      <Shot caption="Lista zapisanych promptów." />
      <p>
        Foldery są już po stronie serwera — w tej wersji lista jest płaska. Segregacja w UI przyjdzie,
        jak ogarniemy podstawowy flow.
      </p>
      <p>
        Z karty wyniku w konsoli możesz skopiować prompt (albo prompt + negative), ocenić oś błędu
        i wrzucić do folderu.
      </p>
    </article>
  );
}
