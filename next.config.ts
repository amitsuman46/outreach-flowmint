import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second server (for example a test run on another port) build into its own folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "playwright",
    "imapflow",
    "mailparser",
    "@zone-eu/mailsplit",
    "nodemailer",
    "xlsx",
    "@prisma/client",
  ],
};

export default nextConfig;
