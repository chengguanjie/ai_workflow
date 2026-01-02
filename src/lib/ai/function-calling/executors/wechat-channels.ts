/**
 * 视频号（WeChat Channels）工具执行器（增强版）
 *
 * 支持功能：
 * - publish: 发布视频/图文
 * - upload: 上传素材（视频/图片）
 * - material_list: 获取素材列表
 * - material_delete: 删除素材
 * - status: 查询发布状态
 * - stats: 获取视频数据统计
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'
import { getIntegrationAccessToken } from '@/lib/integrations/credentials'

type ChannelsAction = 'publish' | 'upload' | 'material_list' | 'material_delete' | 'status' | 'stats'

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

export class WechatChannelsToolExecutor implements ToolExecutor {
  name = 'wechat_channels'
  description = '视频号：内容发布与管理（支持发布、素材管理、状态查询、数据统计）'
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
          description: '动作类型：publish(发布)、upload(上传素材)、material_list(素材列表)、material_delete(删除素材)、status(发布状态)、stats(数据统计)', 
          required: true, 
          enum: ['publish', 'upload', 'material_list', 'material_delete', 'status', 'stats'] 
        },
        { name: 'content_type', type: 'string', description: '内容类型：video(视频)、image(图文)', required: false, enum: ['video', 'image'] },
        { name: 'title', type: 'string', description: '标题（publish 必需）', required: false },
        { name: 'description', type: 'string', description: '描述文字', required: false },
        { name: 'video_url', type: 'string', description: '视频 URL（video 类型必需）', required: false },
        { name: 'images', type: 'array', description: '图片 URL 数组（image 类型必需）', required: false },
        { name: 'cover_url', type: 'string', description: '封面图片 URL', required: false },
        { name: 'tags', type: 'array', description: '话题标签数组', required: false },
        { name: 'location', type: 'string', description: '位置信息', required: false },
        { name: 'material_id', type: 'string', description: '素材 ID（material_delete/status 时使用）', required: false },
        { name: 'item_id', type: 'string', description: '视频/作品 ID（status/stats 时使用）', required: false },
        { name: 'material_type', type: 'string', description: '素材类型（material_list 时使用）：video/image/all', required: false, enum: ['video', 'image', 'all'] },
        { name: 'page', type: 'number', description: '分页页码（默认 1）', required: false },
        { name: 'page_size', type: 'number', description: '每页数量（默认 10）', required: false },
      ],
    }
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolCallResult> {
    const startedAt = Date.now()
    try {
      const action = (args.action as ChannelsAction) || 'publish'
      
      if (context.testMode) {
        return this.handleTestMode(action, args, startedAt)
      }

      const baseUrl = getEnv('WECHAT_CHANNELS_API_BASE_URL')
      const { accessToken } = await getIntegrationAccessToken({
        organizationId: context.organizationId,
        provider: 'wechat_channels',
      })

      switch (action) {
        case 'publish':
          return await this.handlePublish(args, baseUrl, accessToken, startedAt)
        case 'upload':
          return await this.handleUpload(args, baseUrl, accessToken, startedAt)
        case 'material_list':
          return await this.handleMaterialList(args, baseUrl, accessToken, startedAt)
        case 'material_delete':
          return await this.handleMaterialDelete(args, baseUrl, accessToken, startedAt)
        case 'status':
          return await this.handleStatus(args, baseUrl, accessToken, startedAt)
        case 'stats':
          return await this.handleStats(args, baseUrl, accessToken, startedAt)
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

  private handleTestMode(action: ChannelsAction, args: Record<string, unknown>, startedAt: number): ToolCallResult {
    const mockResponses: Record<ChannelsAction, unknown> = {
      publish: { 
        testMode: true, 
        action, 
        item_id: 'mock_channels_item_12345',
        status: 'published',
        title: args.title,
        content_type: args.content_type || 'video',
      },
      upload: { 
        testMode: true, 
        action, 
        material_id: 'mock_material_67890',
        type: args.content_type || 'video',
        status: 'uploaded',
      },
      material_list: { 
        testMode: true, 
        action, 
        materials: [
          { material_id: 'mock_mat_1', type: 'video', name: '视频素材1', created_at: new Date().toISOString() },
          { material_id: 'mock_mat_2', type: 'image', name: '图片素材1', created_at: new Date().toISOString() },
        ],
        total: 2,
      },
      material_delete: { 
        testMode: true, 
        action, 
        material_id: args.material_id,
        deleted: true,
      },
      status: { 
        testMode: true, 
        action, 
        item_id: args.item_id || args.material_id,
        status: 'published',
        audit_status: 'approved',
        publish_time: new Date().toISOString(),
      },
      stats: { 
        testMode: true, 
        action, 
        item_id: args.item_id,
        play_count: 5000,
        like_count: 200,
        comment_count: 50,
        share_count: 30,
        favorite_count: 80,
        forward_count: 15,
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
    const contentType = optionalString(args, 'content_type') || 'video'
    const description = optionalString(args, 'description') || ''
    const coverUrl = optionalString(args, 'cover_url')
    const tags = optionalArray(args, 'tags')
    const location = optionalString(args, 'location')

    let payload: Record<string, unknown> = {
      title,
      description,
      content_type: contentType,
      cover_url: coverUrl,
      tags,
      location,
    }

    if (contentType === 'video') {
      const videoUrl = requireString(args, 'video_url')
      payload.video_url = videoUrl
    } else if (contentType === 'image') {
      const images = optionalArray(args, 'images')
      if (images.length === 0) {
        throw new Error('图文类型需要提供 images 数组')
      }
      payload.images = images
    }

    const endpoint = getEnv('WECHAT_CHANNELS_PUBLISH_ENDPOINT', '/channels/publish')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleUpload(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const contentType = optionalString(args, 'content_type') || 'video'
    let payload: Record<string, unknown> = { type: contentType }

    if (contentType === 'video') {
      const videoUrl = optionalString(args, 'video_url')
      if (!videoUrl) {
        throw new Error('上传视频需要提供 video_url')
      }
      payload.video_url = videoUrl
    } else if (contentType === 'image') {
      const images = optionalArray(args, 'images')
      if (images.length === 0) {
        throw new Error('上传图片需要提供 images 数组')
      }
      payload.images = images
    }

    const endpoint = getEnv('WECHAT_CHANNELS_UPLOAD_ENDPOINT', '/channels/material/upload')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleMaterialList(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const page = typeof args.page === 'number' ? args.page : 1
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 10
    const materialType = optionalString(args, 'material_type') || 'all'

    const endpoint = getEnv('WECHAT_CHANNELS_MATERIAL_LIST_ENDPOINT', '/channels/material/list')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(pageSize))
    if (materialType !== 'all') {
      url.searchParams.set('type', materialType)
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleMaterialDelete(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const materialId = requireString(args, 'material_id')

    const endpoint = getEnv('WECHAT_CHANNELS_MATERIAL_DELETE_ENDPOINT', '/channels/material/delete')
    const url = new URL(endpoint, baseUrl).toString()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ material_id: materialId }),
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
    const materialId = optionalString(args, 'material_id')
    
    if (!itemId && !materialId) {
      throw new Error('查询状态需要提供 item_id 或 material_id')
    }

    const endpoint = getEnv('WECHAT_CHANNELS_STATUS_ENDPOINT', '/channels/status')
    const url = new URL(endpoint, baseUrl)
    if (itemId) url.searchParams.set('item_id', itemId)
    if (materialId) url.searchParams.set('material_id', materialId)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleStats(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const itemId = requireString(args, 'item_id')

    const endpoint = getEnv('WECHAT_CHANNELS_STATS_ENDPOINT', '/channels/stats')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('item_id', itemId)
    
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
        error: `视频号 API 错误: HTTP ${response.status} ${response.statusText}`,
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
