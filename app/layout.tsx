import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from '@/components/ui/tooltip';
import './components.css';
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Sentinel — Incident Commander",
  description: "Diagnose, remediate, and verify production incidents across your engineering stack.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${geist.variable} ${mono.variable}`}>
      <body><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
