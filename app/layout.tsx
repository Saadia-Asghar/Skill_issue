import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Fredoka } from "next/font/google";

import { Nav } from "@/components/nav";
import { GameOverBoundary } from "@/components/game/error-boundary";
import { PostHogProvider } from "@/lib/posthog/provider";

import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Professor Decompose — The Cognitive Arena",
  description:
    "The LeetCode of Learning. Master concepts in your favorite influencer's voice, prove it in the Comprehension Gauntlet, climb the Dean's List.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#8b5cf6",
          colorBackground: "#161029",
          colorInputBackground: "#221a3a",
          colorText: "#fff8e7",
          colorTextSecondary: "#b8aedc",
          colorInputText: "#fff8e7",
          colorNeutral: "#b8aedc",
          borderRadius: "1rem",
          fontFamily: "var(--font-fredoka)",
        },
        elements: {
          card: "bg-surface border border-border",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted",
        },
      }}
    >
      <html
        lang="en"
        className={`${fredoka.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <PostHogProvider>
            <Nav />
            <GameOverBoundary>
              <main className="flex-1 flex flex-col">{children}</main>
            </GameOverBoundary>
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
