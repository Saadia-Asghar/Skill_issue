import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Bungee, Nunito } from "next/font/google";

import { Nav } from "@/components/nav";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { GameOverBoundary } from "@/components/game/error-boundary";
import { PostHogProvider } from "@/lib/posthog/provider";

import "./globals.css";

const bungee = Bungee({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bungee",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Skill Issue — The Cognitive Arena",
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
          colorText: "#fdfbf7",
          colorTextSecondary: "#d2c9f1",
          colorInputText: "#fff8e7",
          colorNeutral: "#b8aedc",
          borderRadius: "1rem",
          fontFamily: "var(--font-nunito)",
        },
        elements: {
          card: "bg-surface border border-border",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted",
          userProfileModalCard: "bg-surface text-foreground border-2 border-border",
          userProfileScrollBox: "bg-surface text-foreground",
          profileSectionTitleText: "text-foreground",
          profileSectionPrimaryButton: "text-foreground",
          formFieldLabel: "text-foreground",
          formFieldInput: "text-foreground",
          formFieldHintText: "text-muted",
          formButtonPrimary: "arcade arcade-sm",
          navbar: "bg-[color:var(--surface-2)] border-r border-border",
          navbarButton: "text-foreground hover:bg-[color:var(--surface-2)]",
          navbarButtonText: "text-foreground",
          userPreviewMainIdentifier: "text-foreground",
          userPreviewSecondaryIdentifier: "text-muted",
          badge: "text-foreground border border-border",
        },
      }}
    >
      <html
        lang="en"
        className={`${bungee.variable} ${nunito.variable} h-full antialiased`}
      >
        <body className="min-h-screen antialiased flex flex-col">
          <PostHogProvider>
            <Nav />
            <GameOverBoundary>
              <main className="layout-canvas flex flex-1 flex-col">{children}</main>
            </GameOverBoundary>
            <ChatDrawer />
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
