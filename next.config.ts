import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // Native / server-only packages that must not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client"],
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Service workers need HTTPS (or localhost); disable in dev to avoid noise.
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
