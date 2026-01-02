/**
 * 抖音工具执行器（增强版）
 *
 * 支持功能：
 * - publish: 发布视频
 * - upload: 上传视频素材
 * - draft_create: 创建草稿
 * - draft_list: 获取草稿列表
 * - draft_delete: 删除草稿
 * - schedule: 定时发布
 * - status: 查询发布状态
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'
import { getIntegrationAccessToken } from '@/lib/integrations/credentials'

type DouyinAction = 'publish' | 'upload' | 'draft_create' | 'draft_list' | 'draft_delete' | 'schedule' | 'status'

function getEnv(name: string, defaultValue?: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value.trim()
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少必需参数: ${key}`)
  }
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return undefined
}

function optionalArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key]
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

export class DouyinVideoToolExecutor implements ToolExecutor {
  name = 'douyin_video'
  description = '抖音：视频发布与管理（支持发布、上传、草稿、定时发布、状态查询）'
  category = 'custom'

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      category: 'custom',
      parameters: [
        { 
          name: 'action', 
          type: 'string', 
          description: '动作类型：publish(发布)、upload(上传素材)、draft_create(创建草稿)、draft_list(草稿列表)、draft_delete(删除草稿)、schedule(定时发布)、status(查询状态)', 
          required: true, 
          enum: ['publish', 'upload', 'draft_create', 'draft_list', 'draft_delete', 'schedule', 'status'] 
        },
        { name: 'title', type: 'string', description: '视频标题（publish/draft_create/schedule 必需）', required: false },
        { name: 'description', type: 'string', description: '视频描述', required: false },
        { name: 'video_url', type: 'string', description: '视频 URL（publish/draft_create/schedule 必需）', required: false },
        { name: 'video_file', type: 'string', description: '本地视频文件路径（upload 时使用）', required: false },
        { name: 'cover_url', type: 'string', description: '封面图片 URL', required: false },
        { name: 'tags', type: 'array', description: '话题标签数组', required: false },
        { name: 'draft_id', type: 'string', description: '草稿 ID（draft_delete/status 时使用）', required: false },
        { name: 'item_id', type: 'string', description: '视频/作品 ID（status 查询时使用）', required: false },
        { name: 'schedule_time', type: 'string', description: '定时发布时间（ISO 8601 格式，如 2024-01-15T10:00:00+08:00）', required: false },
        { name: 'page', type: 'number', description: '分页页码（draft_list 时使用，默认 1）', required: false },
        { name: 'page_size', type: 'number', description: '每页数量（draft_list 时使用，默认 10）', required: false },
      ],
    }
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolCallResult> {
    const startedAt = Date.now()
    try {
      const action = (args.action as DouyinAction) || 'publish'
      
      if (context.testMode) {
        return this.handleTestMode(action, args, startedAt)
      }

      const baseUrl = getEnv('DOUYIN_API_BASE_URL')
      const { accessToken } = await getIntegrationAccessToken({
        organizationId: context.organizationId,
        provider: 'douyin_video',
      })

      switch (action) {
        case 'publish':
          return await this.handlePublish(args, baseUrl, accessToken, startedAt)
        case 'upload':
          return await this.handleUpload(args, baseUrl, accessToken, startedAt)
        case 'draft_create':
          return await this.handleDraftCreate(args, baseUrl, accessToken, startedAt)
        case 'draft_list':
          return await this.handleDraftList(args, baseUrl, accessToken, startedAt)
        case 'draft_delete':
          return await this.handleDraftDelete(args, baseUrl, accessToken, startedAt)
        case 'schedule':
          return await this.handleSchedule(args, baseUrl, accessToken, startedAt)
        case 'status':
          return await this.handleStatus(args, baseUrl, accessToken, startedAt)
        default:
          throw new Error(`不支持的 action: ${action}`)
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

  private handleTestMode(action: DouyinAction, args: Record<string, unknown>, startedAt: number): ToolCallResult {
    const mockResponses: Record<DouyinAction, unknown> = {
      publish: { 
        testMode: true, 
        action, 
        item_id: 'mock_item_12345',
        status: 'published',
        title: args.title,
      },
      upload: { 
        testMode: true, 
        action, 
        video_id: 'mock_video_67890',
        status: 'uploaded',
      },
      draft_create: { 
        testMode: true, 
        action, 
        draft_id: 'mock_draft_11111',
        title: args.title,
      },
      draft_list: { 
        testMode: true, 
        action, 
        drafts: [
          { draft_id: 'mock_draft_1', title: '草稿1', created_at: new Date().toISOString() },
          { draft_id: 'mock_draft_2', title: '草稿2', created_at: new Date().toISOString() },
        ],
        total: 2,
      },
      draft_delete: { 
        testMode: true, 
        action, 
        draft_id: args.draft_id,
        deleted: true,
      },
      schedule: { 
        testMode: true, 
        action, 
        item_id: 'mock_scheduled_22222',
        schedule_time: args.schedule_time,
        status: 'scheduled',
      },
      status: { 
        testMode: true, 
        action, 
        item_id: args.item_id || args.draft_id,
        status: 'published',
        play_count: 1000,
        like_count: 50,
        comment_count: 10,
      },
    }

    return {
      toolCallId: '',
      toolName: this.name,
      success: true,
      duration: Date.now() - startedAt,
      result: mockResponses[action],
    }
  }

  private async handlePublish(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const title = requireString(args, 'title')
    const videoUrl = requireString(args, 'video_url')
    const description = optionalString(args, 'description') || ''
    const coverUrl = optionalString(args, 'cover_url')
    const tags = optionalArray(args, 'tags')

    const endpoint = getEnv('DOUYIN_PUBLISH_ENDPOINT', '/video/publish')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ title, description, video_url: videoUrl, cover_url: coverUrl, tags }),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleUpload(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const videoFile = optionalString(args, 'video_file')
    const videoUrl = optionalString(args, 'video_url')
    
    if (!videoFile && !videoUrl) {
      throw new Error('上传视频需要提供 video_file（本地路径）或 video_url（远程URL）')
    }

    const endpoint = getEnv('DOUYIN_UPLOAD_ENDPOINT', '/video/upload')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ 
        video_file: videoFile, 
        video_url: videoUrl,
      }),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleDraftCreate(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const title = requireString(args, 'title')
    const videoUrl = requireString(args, 'video_url')
    const description = optionalString(args, 'description') || ''
    const coverUrl = optionalString(args, 'cover_url')
    const tags = optionalArray(args, 'tags')

    const endpoint = getEnv('DOUYIN_DRAFT_CREATE_ENDPOINT', '/video/draft/create')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ title, description, video_url: videoUrl, cover_url: coverUrl, tags }),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleDraftList(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const page = typeof args.page === 'number' ? args.page : 1
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 10

    const endpoint = getEnv('DOUYIN_DRAFT_LIST_ENDPOINT', '/video/draft/list')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(pageSize))
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleDraftDelete(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const draftId = requireString(args, 'draft_id')

    const endpoint = getEnv('DOUYIN_DRAFT_DELETE_ENDPOINT', '/video/draft/delete')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ draft_id: draftId }),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleSchedule(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const title = requireString(args, 'title')
    const videoUrl = requireString(args, 'video_url')
    const scheduleTime = requireString(args, 'schedule_time')
    const description = optionalString(args, 'description') || ''
    const coverUrl = optionalString(args, 'cover_url')
    const tags = optionalArray(args, 'tags')

    // 验证定时时间格式
    const scheduleDate = new Date(scheduleTime)
    if (isNaN(scheduleDate.getTime())) {
      throw new Error('schedule_time 格式无效，请使用 ISO 8601 格式（如 2024-01-15T10:00:00+08:00）')
    }
    if (scheduleDate.getTime() <= Date.now()) {
      throw new Error('定时发布时间必须是未来时间')
    }

    const endpoint = getEnv('DOUYIN_SCHEDULE_ENDPOINT', '/video/schedule')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ 
        title, 
        description, 
        video_url: videoUrl, 
        cover_url: coverUrl, 
        tags,
        schedule_time: scheduleTime,
      }),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleStatus(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const itemId = optionalString(args, 'item_id')
    const draftId = optionalString(args, 'draft_id')
    
    if (!itemId && !draftId) {
      throw new Error('查询状态需要提供 item_id 或 draft_id')
    }

    const endpoint = getEnv('DOUYIN_STATUS_ENDPOINT', '/video/status')
    const url = new URL(endpoint, baseUrl)
    if (itemId) url.searchParams.set('item_id', itemId)
    if (draftId) url.searchParams.set('draft_id', draftId)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleResponse(response: Response, startedAt: number): Promise<ToolCallResult> {
    const raw = await response.text()
    let data: unknown = raw
    try { 
      data = raw ? JSON.parse(raw) : {} 
    } catch { 
      /* keep raw */ 
    }

    if (!response.ok) {
      return {
        toolCallId: '',
        toolName: this.name,
        success: false,
        duration: Date.now() - startedAt,
        error: `抖音 API 错误: HTTP ${response.status} ${response.statusText}`,
        result: data,
      }
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
