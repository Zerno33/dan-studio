import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap" });
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

export const metadata = {
  title: "DAN STUDIO — PROMPT_ENGINE",
  description: "Konsola BRNS — generowanie promptów N1 / S1 / R1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className={`${inter.className} ${display.variable}`}>{children}</body>
    </html>
  );
}
