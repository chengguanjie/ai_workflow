import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/api/api-response'

export async function POST(_request: NextRequest) {
  return ApiResponse.error('代码执行功能已不再支持，请使用 AI 处理节点', 400)
}
