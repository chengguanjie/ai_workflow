/**
 * 微信公众号（MP）工具执行器
 *
 * 最小可用：创建草稿 + 提交发布（freepublish）+ 查询发布状态
 * 依赖环境变量：
 * - WECHAT_MP_APP_ID
 * - WECHAT_MP_APP_SECRET
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'
import { getWeChatMpAccessToken } from '@/lib/integrations/wechat/mp'

type MpOperation = 'create_draft' | 'submit_publish' | 'get_publish_status'

function getOperation(args: Record<string, unknown>): MpOperation {
  const op = (args.operation as string | undefined) || 'create_draft'
  if (!['create_draft', 'submit_publish', 'get_publish_status'].includes(op)) {
    throw new Error(`不支持的 operation: ${op}`)
  }
  return op as MpOperation
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少必需参数: ${key}`)
  }
  return value.trim()
}

export class WechatMpToolExecutor implements ToolExecutor {
  name = 'wechat_mp'
  description = '微信公众号：创建草稿、提交发布、查询发布状态'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: '操作类型：create_draft/submit_publish/get_publish_status',
          required: true,
          enum: ['create_draft', 'submit_publish', 'get_publish_status'],
        },
        { name: 'title', type: 'string', description: '文章标题（create_draft）', required: false },
        { name: 'author', type: 'string', description: '作者（create_draft，可选）', required: false },
        { name: 'digest', type: 'string', description: '摘要（create_draft，可选）', required: false },
        { name: 'content', type: 'string', description: '正文 HTML（create_draft）', required: false },
        { name: 'content_source_url', type: 'string', description: '阅读原文链接（create_draft，可选）', required: false },
        { name: 'thumb_media_id', type: 'string', description: '封面图 media_id（create_draft，可选）', required: false },
        { name: 'need_open_comment', type: 'number', description: '是否打开评论（0/1，可选）', required: false },
        { name: 'only_fans_can_comment', type: 'number', description: '是否仅粉丝可评论（0/1，可选）', required: false },
        { name: 'media_id', type: 'string', description: '草稿 media_id（submit_publish 必填）', required: false },
        { name: 'publish_id', type: 'string', description: '发布 publish_id（get_publish_status 必填）', required: false },
      ],
    }
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolCallResult> {
    const startedAt = Date.now()

    try {
      const operation = getOperation(args)

      if (context.testMode) {
        return {
          toolCallId: '',
          toolName: this.name,
          success: true,
          duration: Date.now() - startedAt,
          result: { testMode: true, operation, args },
        }
      }

      const accessToken = await getWeChatMpAccessToken()

      switch (operation) {
        case 'create_draft': {
          const title = requireString(args, 'title')
          const content = requireString(args, 'content')

          const payload = {
            articles: [
              {
                title,
                author: typeof args.author === 'string' ? args.author : undefined,
                digest: typeof args.digest === 'string' ? args.digest : undefined,
                content,
                content_source_url: typeof args.content_source_url === 'string' ? args.content_source_url : undefined,
                thumb_media_id: typeof args.thumb_media_id === 'string' ? args.thumb_media_id : undefined,
                need_open_comment: typeof args.need_open_comment === 'number' ? args.need_open_comment : undefined,
                only_fans_can_comment: typeof args.only_fans_can_comment === 'number' ? args.only_fans_can_comment : undefined,
              },
            ],
          }

          const url = new URL('https://api.weixin.qq.com/cgi-bin/draft/add')
          url.searchParams.set('access_token', accessToken)

          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload),
          })
          const data = await response.json()
          if (!response.ok || data.errcode) {
            throw new Error(`create_draft 失败: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`)
          }

          return {
            toolCallId: '',
            toolName: this.name,
            success: true,
            duration: Date.now() - startedAt,
            result: data,
          }
        }

        case 'submit_publish': {
          const mediaId = requireString(args, 'media_id')
          const url = new URL('https://api.weixin.qq.com/cgi-bin/freepublish/submit')
          url.searchParams.set('access_token', accessToken)

          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ media_id: mediaId }),
          })
          const data = await response.json()
          if (!response.ok || data.errcode) {
            throw new Error(`submit_publish 失败: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`)
          }

          return {
            toolCallId: '',
            toolName: this.name,
            success: true,
            duration: Date.now() - startedAt,
            result: data,
          }
        }

        case 'get_publish_status': {
          const publishId = requireString(args, 'publish_id')
          const url = new URL('https://api.weixin.qq.com/cgi-bin/freepublish/get')
          url.searchParams.set('access_token', accessToken)

          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ publish_id: publishId }),
          })
          const data = await response.json()
          if (!response.ok || data.errcode) {
            throw new Error(`get_publish_status 失败: ${data.errcode ?? response.status} ${data.errmsg ?? response.statusText}`)
          }

          return {
            toolCallId: '',
            toolName: this.name,
            success: true,
            duration: Date.now() - startedAt,
            result: data,
          }
        }
      }
    } catch (error) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        duration: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

