import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/orm-sqlite"],
};

export default nextConfig;
