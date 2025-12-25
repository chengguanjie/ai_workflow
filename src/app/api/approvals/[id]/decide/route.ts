/**
 * 审批决定 API
 *
 * POST /api/approvals/[id]/decide - 提交审批决定
 * 
 * 注意：审批节点功能已暂时禁用
 */

import { NextRequest } from 'next/server'
import { ApiResponse } from '@/lib/api/api-response'

export async function POST(
  _request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  return ApiResponse.error('审批节点功能已暂时禁用', 400)
}
