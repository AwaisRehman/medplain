import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
   serverExternalPackages: ["pdfjs-dist", "tesseract.js"],
   devIndicators: false,
};

export default nextConfig;
