/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexus/db", "@nexus/shared", "@nexus/prompts"],
};

export default nextConfig;
