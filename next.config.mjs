/** @type {import('next').NextConfig} */
const nextConfig = {
  // 移除 standalone 模式，使用标准部署方式避免 clientModules 错误
  // output: 'standalone',
  
  // 构建时忽略 ESLint 警告
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 允许加载 Pyodide CDN 资源
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
    ]
  },

  // 外部包配置 (Next.js 14.x 语法)
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
}

export default nextConfig
