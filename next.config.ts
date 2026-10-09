import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    // Página já aberta volta na hora. Uma gravação invalida o cache pelo revalidatePath.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
