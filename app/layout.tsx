// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedPlain — Plain-language medical text",
  description:
    "Simplify medical text into plain language, in English and Arabic. Runs locally and privately on your own device, with a built-in faithfulness check.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
