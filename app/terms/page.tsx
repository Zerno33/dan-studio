export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, lineHeight: 1.6 }}>
      <h1>Terms of Use / Responsible Use</h1>
      <p>
        Korzystając z PROMPT_ENGINE potwierdzasz, że masz prawa i zgody do wszystkich wizerunków
        i materiałów, które wgrywasz. Nie używaj systemu do treści nielegalnych, do deepfake bez
        zgody, ani do obchodzenia zabezpieczeń modeli.
      </p>
      <p>
        Wyjścia są treścią wygenerowaną przez AI (AI Act art. 50). Operator może zablokować konto
        przy naruszeniu regulaminu.
      </p>
      <p>
        <a href="/login">Powrót</a>
      </p>
    </main>
  );
}
