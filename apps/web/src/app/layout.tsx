import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentPulse",
  description: "AI agent observability, from trace to root cause.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
