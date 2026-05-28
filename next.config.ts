import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native / server-only packages that must not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

export default nextConfig;
