import path from "node:path";
import type { NextConfig } from "next";

const isDemo = process.env.DEMO_MODE === "1";

const nextConfig: NextConfig = {};

if (isDemo) {
  // Turbopack `resolveAlias` expects bare specifiers or paths relative to the
  // project root (NOT absolute filesystem paths — they get treated as URLs).
  nextConfig.turbopack = {
    resolveAlias: {
      "@clerk/nextjs": "./lib/auth-shim/client.tsx",
      "@clerk/nextjs/server": "./lib/auth-shim/server.ts",
    },
  };

  nextConfig.webpack = (config: unknown) => {
    const cfg = config as {
      resolve?: { alias?: Record<string, string> };
    };
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      "@clerk/nextjs": path.resolve(
        process.cwd(),
        "lib/auth-shim/client.tsx",
      ),
      "@clerk/nextjs/server": path.resolve(
        process.cwd(),
        "lib/auth-shim/server.ts",
      ),
    };
    return cfg;
  };
}

export default nextConfig;
