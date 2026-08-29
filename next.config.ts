import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: [
    "mongoose",
    "mongodb-memory-server",
    "bcryptjs",
    "jsonwebtoken",
    "nodemailer",
    "otplib",
    "qrcode",
    "@el-zazo/email-verifier",
  ],
};

export default nextConfig;
