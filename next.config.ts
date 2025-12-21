import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 注意：Zeabur 平台不支持 standalone 模式，已禁用
  // output: 'standalone',

  // 构建时忽略 ESLint 警告（这些警告不影响功能）
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
            value: 'require-corp',
          },
        ],
      },
    ]
  },

  // 外部包配置
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
