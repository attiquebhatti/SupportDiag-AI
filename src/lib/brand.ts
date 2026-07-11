// Central branding constants. Override the display name with
// NEXT_PUBLIC_APP_NAME if needed; everything else derives from here.

export const BRAND = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "SupportDiag AI",
  subtitle: "Support File Analyzer",
  tagline: "AI-powered support file diagnostics for security and network teams.",
  altSubtitle: "Multi-vendor support bundle analyzer for faster troubleshooting.",
  description:
    "SupportDiag AI is an AI-assisted diagnostic platform that helps engineers analyze support files, logs, and troubleshooting bundles from firewalls, security platforms, and infrastructure systems.",
  disclaimer:
    "SupportDiag AI is an independent diagnostic assistant. It is not affiliated with, endorsed by, or officially supported by Palo Alto Networks, Check Point, Fortinet, or any other vendor. Findings are evidence-based recommendations and should be validated by a qualified engineer before making production changes.",
  reportFilePrefix: "supportdiag-report",
} as const;
