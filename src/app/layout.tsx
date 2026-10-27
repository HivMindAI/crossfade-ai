import type { Metadata } from "next";
import "./globals.css";
import "./liquid-glass.css";

export const metadata: Metadata = {
  title: "CROSSFADE — cultural negotiation intelligence",
  description:
    "Find shared ground between different audiences and see the evidence behind every plan.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
