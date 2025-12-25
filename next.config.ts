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

  // 安全响应头配置
  async headers() {
    // 基础安全头（不包含可能影响样式加载的头）
    const securityHeaders = [
      // 防止 MIME 类型嗅探攻击
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // 防止点击劫持攻击
      { key: 'X-Frame-Options', value: 'DENY' },
      // 启用浏览器 XSS 过滤器
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      // 强制 HTTPS 连接（仅生产环境）
      ...(process.env.NODE_ENV === 'production' 
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
      // 控制 Referrer 信息发送
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // 限制浏览器功能权限
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
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
