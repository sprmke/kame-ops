import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";
import { LOCAL_DEV_APP_URL } from "@/lib/constants/dev-url";
import { fontDisplay, fontSans } from "@/lib/fonts";

import "@/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KameOps", template: "%s | KameOps" },
  description:
    "Business automation platform for credit cards, reminders, and workflows.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || LOCAL_DEV_APP_URL,
  ),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable}`}
    >
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
