import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Без значка Next.js у кутку в режимі розробки — заважає скріншотам для портфоліо.
  devIndicators: false,
};

export default nextConfig;
