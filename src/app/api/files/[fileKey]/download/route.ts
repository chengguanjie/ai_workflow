/**
 * 文件下载 API
 *
 * GET /api/files/[fileKey]/download - 下载文件
 */

import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { auth } from '@/lib/auth'
import { storageService } from '@/lib/storage'

interface RouteParams {
  params: Promise<{ fileKey: string }>
}

/**
 * GET /api/files/[fileKey]/download
 * 下载文件
 *
 * 支持 Range 请求（用于大文件和视频流）
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { fileKey } = await params
    const decodedKey = decodeURIComponent(fileKey)

    // 获取文件信息
    const downloadInfo = await storageService.getDownloadInfoByKey(decodedKey)

    if (!downloadInfo) {
      return NextResponse.json(
        { error: '文件不存在、已过期或已达下载次数限制' },
        { status: 404 }
      )
    }

    const { file, localPath } = downloadInfo

    // 验证权限
    if (file.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: '无权下载此文件' }, { status: 403 })
    }

    // 本地存储：直接流式传输
    if (localPath) {
      try {
        const fileStat = await stat(localPath)
        const fileSize = fileStat.size
        const range = request.headers.get('range')

        // 设置通用响应头
        const headers: HeadersInit = {
          'Content-Type': file.mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        }

        // 支持 Range 请求
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
          const chunkSize = end - start + 1

          headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`
          headers['Content-Length'] = String(chunkSize)

          const stream = createReadStream(localPath, { start, end })
          const readableStream = nodeStreamToWebStream(stream)

          return new Response(readableStream, {
            status: 206,
            headers,
          })
        }

        // 完整文件下载
        headers['Content-Length'] = String(fileSize)
        const stream = createReadStream(localPath)
        const readableStream = nodeStreamToWebStream(stream)

        return new Response(readableStream, {
          status: 200,
          headers,
        })
      } catch (error) {
        console.error('Read file error:', error)
        return NextResponse.json(
          { error: '读取文件失败' },
          { status: 500 }
        )
      }
    }

    // 云存储：重定向到签名 URL
    // 此处应该从存储服务获取签名 URL 并重定向
    return NextResponse.json(
      { error: '云存储下载暂未实现' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Download file error:', error)
    return NextResponse.json(
      { error: '下载文件失败' },
      { status: 500 }
    )
  }
}

/**
 * 将 Node.js 流转换为 Web 流
 */
function nodeStreamToWebStream(
  nodeStream: ReturnType<typeof createReadStream>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buffer))
      })
      nodeStream.on('end', () => {
        controller.close()
      })
      nodeStream.on('error', (error) => {
        controller.error(error)
      })
    },
    cancel() {
      nodeStream.destroy()
    },
  })
}
