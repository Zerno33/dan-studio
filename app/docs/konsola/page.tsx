import { Shot } from "../ui";

export const metadata = { title: "Konsola" };

export default function DocsKonsola() {
  return (
    <article>
      <p className="docs-kicker">Start</p>
      <h1>Konsola</h1>
      <p className="docs-lead">
        To główny ekran po zalogowaniu. Tu wybierasz system, wrzucasz materiał i generujesz.
      </p>
      <Shot caption="Góra ekranu: kredyty, zakładki, wyloguj." />
      <h2>Co jest na górze</h2>
      <ul>
        <li>
          <b>Kredyty</b> — ile strzałów Ci zostało. Koszt konkretnej operacji widać nad przyciskiem
          Generuj.
        </li>
        <li>
          <b>Konsola</b> — generowanie.
        </li>
        <li>
          <b>Biblioteka</b> — to, co już poszło.
        </li>
      </ul>
      <Shot caption="Formularz: system, długość, załączniki, brief, Generuj." />
      <h2>Generuj</h2>
      <p>
        Przycisk woła backend. System prompt zostaje na serwerze — w przeglądarce widzisz tylko
        wynik (PROMPT + NEGATIVE).
      </p>
      <p>
        Jak zabraknie kredytów, dostaniesz komunikat. Jak model padnie, kredyty wracają.
      </p>
    </article>
  );
}
