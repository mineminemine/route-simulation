import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath =
  process.env.PAGES_BASE_PATH ??
  (process.env.GITHUB_ACTIONS === "true"
    ? `/${repositoryName ?? "route-simulation"}`
    : "");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
};

export default nextConfig;
