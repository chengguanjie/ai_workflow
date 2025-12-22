import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 注意：Zeabur 平台不支持 standalone 模式，已禁用
  // output: 'standalone',

  // 构建时忽略 ESLint 警告（这些警告不影响功能）
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Next.js 15.0.3 在部分环境下开启 build worker 会触发 diagnostics JSON 并发写入导致构建失败
  experimental: {
    webpackBuildWorker: false,
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

  // 外部包配置 - 这些包只能在服务端使用
  serverExternalPackages: [
    'better-sqlite3',
    'isolated-vm',
    'dockerode',
    'bullmq',
  ],
}

export default nextConfig
