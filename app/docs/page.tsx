import { Shot } from "./ui";

export const metadata = { title: "Jak to działa" };

export default function DocsHome() {
  return (
    <article>
      <p className="docs-kicker">Start</p>
      <h1>PROMPT_ENGINE robi prompty, nie obrazy</h1>
      <p className="docs-lead">
        Wybierasz system (N1, S1 albo R1), wrzucasz zdjęcie albo tekst, klikasz Generuj.
        Dostajesz bloki promptów po angielsku — te wklejasz do swojego generatora obrazów.
      </p>
      <Shot caption="Ekran logowania — tu wrzucimy screen, jak zrobisz zrzut." />
      <h2>W 4 krokach</h2>
      <ol>
        <li>Załóż konto na stronie logowania (zgoda na regulamin jest obowiązkowa).</li>
        <li>Wejdź do konsoli. Na start dostajesz pulę kredytów na testy.</li>
        <li>Wybierz system i wygeneruj pierwszy zestaw.</li>
        <li>Kopiuj bloki. Zapisują się też w Bibliotece.</li>
      </ol>
      <p className="docs-note">
        Sufit treści: swimsuit / bielizna, bez explicit. Wrzucone zdjęcia muszą być Twoje albo
        z zgodą osoby na zdjęciu.
      </p>
    </article>
  );
}
