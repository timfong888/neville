import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The architecture page was removed (#112); old links go to the home page instead of a 404.
      { source: "/architecture", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
