/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdf.js(PDFの読み取り)がNode.js用に参照する canvas は、ブラウザ向けのビルドには不要
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;
