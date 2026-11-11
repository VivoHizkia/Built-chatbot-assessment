import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlacidWay Assistant – ITC Tijuana knowledge chatbot",
  description:
    "Ask about ITC Immunity Therapy Center treatments, packages and prices. Answers come only from PlacidWay pages.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
