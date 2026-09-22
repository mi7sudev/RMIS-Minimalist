import type { Metadata } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

// Dialog type system: Inter for body/UI; DM Sans (PP Radio Grotesk substitute,
// light geometric grotesque) for display headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const radio = DM_Sans({
  variable: "--font-radio",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "MIRDC Recruitment — RMIS",
  description:
    "Recruitment Management Information System of the Metals Industry Research and Development Center (DOST-MIRDC). Browse positions, apply online, and track your application.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${radio.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
        <Sonner richColors position="top-right" />
      </body>
    </html>
  );
}
