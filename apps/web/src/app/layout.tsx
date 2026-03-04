import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maxions",
  description: "One-shot coding agent platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="dark" lang="en">
      <body>{children}</body>
    </html>
  );
}
