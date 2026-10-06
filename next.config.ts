import type { NextConfig } from "next";

const pagesUrl = process.env.CF_PAGES_URL ?? "";
const isQingkePages = /qingke-(front|admin)\.pages\.dev/.test(pagesUrl);
const commit = process.env.CF_PAGES_COMMIT_SHA ?? "";

const nextConfig: NextConfig = {
  output: "export",
  ...(isQingkePages && commit ? { assetPrefix: `/qingke-assets-${commit.slice(0, 12)}` } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
