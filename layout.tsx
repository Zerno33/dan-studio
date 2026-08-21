export const metadata = {
  title: "DAN STUDIO — PROMPT_ENGINE",
  description: "Skeleton deploy — pierwszy preview, MYS-11",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
