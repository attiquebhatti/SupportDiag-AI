import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FirewallLens AI",
  description: "AI-assisted firewall support file analysis for faster troubleshooting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
