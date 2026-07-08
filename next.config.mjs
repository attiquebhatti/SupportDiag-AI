/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "tar-stream", "adm-zip"],
  eslint: {
    // Do not fail production builds on lint errors (Hostinger build stability).
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Support larger multipart uploads via server actions / route handlers.
    serverActions: {
      bodySizeLimit: "110mb",
    },
  },
};

export default nextConfig;
