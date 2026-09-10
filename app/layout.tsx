import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "orvia — Media Operation",
  description: "A premium media operation for sensing signals, shaping stories, publishing and learning.",
  applicationName: "orvia",
  themeColor: "#0b0b0d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
