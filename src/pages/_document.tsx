import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Fallback custom Document.
 *
 * Next.js App Router 不需要 _document，但在旧版依赖或第三方库引用 pages 目录时
 * build 过程仍可能尝试解析该文件。提供最小实现即可消除 PageNotFoundError。
 */
export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
