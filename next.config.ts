import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The home folder has its own lockfile; pin the root to this project.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
