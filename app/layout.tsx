import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "solefoot — Good soles. Great stakes.",
  description: "Snap your sole, win the votes and take the pool. Foot-photo rounds with USDG entries and on-chain payouts on Robinhood Chain.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
