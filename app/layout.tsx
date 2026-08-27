import "./globals.css";

export const metadata = {
  title: "DAN STUDIO — PROMPT_ENGINE",
  description: "Konsola BRNS — generowanie promptów N1 / S1 / R1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
