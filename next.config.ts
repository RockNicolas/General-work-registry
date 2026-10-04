import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `standalone` só na imagem Docker (NEXT_OUTPUT definido no Dockerfile): no Windows
  // ele exige privilégio de symlink e quebra o `pnpm build` local.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
