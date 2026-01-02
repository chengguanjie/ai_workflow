/**
 * 小红书工具执行器（增强版）
 *
 * 支持功能：
 * - publish: 发布笔记（图文/视频）
 * - topic_search: 搜索话题
 * - topic_hot: 获取热门话题
 * - tag_recommend: 获取推荐标签
 * - status: 查询笔记状态（包含审核状态）
 * - stats: 获取笔记数据统计
 * - draft_create: 创建草稿
 * - draft_list: 获取草稿列表
 */

import type { ToolExecutor, ToolDefinition, ToolCallResult, ToolExecutionContext } from '../types'
import { getIntegrationAccessToken } from '@/lib/integrations/credentials'

type XhsAction = 'publish' | 'topic_search' | 'topic_hot' | 'tag_recommend' | 'status' | 'stats' | 'draft_create' | 'draft_list'

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

export class XiaohongshuToolExecutor implements ToolExecutor {
  name = 'xiaohongshu'
  description = '小红书：笔记发布与管理（支持发布、话题/标签、审核状态、数据统计）'
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
          description: '动作类型：publish(发布)、topic_search(搜索话题)、topic_hot(热门话题)、tag_recommend(推荐标签)、status(笔记状态)、stats(数据统计)、draft_create(创建草稿)、draft_list(草稿列表)', 
          required: true, 
          enum: ['publish', 'topic_search', 'topic_hot', 'tag_recommend', 'status', 'stats', 'draft_create', 'draft_list'] 
        },
        { name: 'content_type', type: 'string', description: '内容类型：image(图文笔记)、video(视频笔记)', required: false, enum: ['image', 'video'] },
        { name: 'title', type: 'string', description: '笔记标题（publish/draft_create 必需）', required: false },
        { name: 'content', type: 'string', description: '笔记正文（支持纯文本或 Markdown）', required: false },
        { name: 'images', type: 'array', description: '图片 URL 数组（图文笔记必需，最多9张）', required: false },
        { name: 'video_url', type: 'string', description: '视频 URL（视频笔记必需）', required: false },
        { name: 'cover_url', type: 'string', description: '封面图片 URL', required: false },
        { name: 'topics', type: 'array', description: '话题数组（如 ["穿搭", "美妆"]）', required: false },
        { name: 'tags', type: 'array', description: '标签数组', required: false },
        { name: 'location', type: 'string', description: '位置信息', required: false },
        { name: 'keyword', type: 'string', description: '搜索关键词（topic_search/tag_recommend 时使用）', required: false },
        { name: 'category', type: 'string', description: '分类（topic_hot 时使用）', required: false },
        { name: 'note_id', type: 'string', description: '笔记 ID（status/stats 时使用）', required: false },
        { name: 'draft_id', type: 'string', description: '草稿 ID', required: false },
        { name: 'page', type: 'number', description: '分页页码（默认 1）', required: false },
        { name: 'page_size', type: 'number', description: '每页数量（默认 10）', required: false },
      ],
    }
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolCallResult> {
    const startedAt = Date.now()
    try {
      const action = (args.action as XhsAction) || 'publish'
      
      if (context.testMode) {
        return this.handleTestMode(action, args, startedAt)
      }

      const baseUrl = getEnv('XHS_API_BASE_URL')
      const { accessToken } = await getIntegrationAccessToken({
        organizationId: context.organizationId,
        provider: 'xiaohongshu',
      })

      switch (action) {
        case 'publish':
          return await this.handlePublish(args, baseUrl, accessToken, startedAt)
        case 'topic_search':
          return await this.handleTopicSearch(args, baseUrl, accessToken, startedAt)
        case 'topic_hot':
          return await this.handleTopicHot(args, baseUrl, accessToken, startedAt)
        case 'tag_recommend':
          return await this.handleTagRecommend(args, baseUrl, accessToken, startedAt)
        case 'status':
          return await this.handleStatus(args, baseUrl, accessToken, startedAt)
        case 'stats':
          return await this.handleStats(args, baseUrl, accessToken, startedAt)
        case 'draft_create':
          return await this.handleDraftCreate(args, baseUrl, accessToken, startedAt)
        case 'draft_list':
          return await this.handleDraftList(args, baseUrl, accessToken, startedAt)
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

  private handleTestMode(action: XhsAction, args: Record<string, unknown>, startedAt: number): ToolCallResult {
    const mockResponses: Record<XhsAction, unknown> = {
      publish: { 
        testMode: true, 
        action, 
        note_id: 'mock_note_12345',
        status: 'pending_audit',
        title: args.title,
        content_type: args.content_type || 'image',
      },
      topic_search: { 
        testMode: true, 
        action, 
        keyword: args.keyword,
        topics: [
          { topic_id: 'topic_1', name: '穿搭分享', hot_score: 95000 },
          { topic_id: 'topic_2', name: '日常穿搭', hot_score: 85000 },
          { topic_id: 'topic_3', name: '冬季穿搭', hot_score: 75000 },
        ],
      },
      topic_hot: { 
        testMode: true, 
        action, 
        category: args.category || 'all',
        topics: [
          { topic_id: 'hot_1', name: '今日热门', rank: 1, hot_score: 100000 },
          { topic_id: 'hot_2', name: '穿搭灵感', rank: 2, hot_score: 95000 },
          { topic_id: 'hot_3', name: '美食探店', rank: 3, hot_score: 90000 },
        ],
      },
      tag_recommend: { 
        testMode: true, 
        action, 
        keyword: args.keyword,
        tags: [
          { tag: '#穿搭', usage_count: 1000000 },
          { tag: '#ootd', usage_count: 800000 },
          { tag: '#日常', usage_count: 600000 },
        ],
      },
      status: { 
        testMode: true, 
        action, 
        note_id: args.note_id,
        status: 'published',
        audit_status: 'approved',
        audit_message: '审核通过',
        publish_time: new Date().toISOString(),
        visibility: 'public',
      },
      stats: { 
        testMode: true, 
        action, 
        note_id: args.note_id,
        view_count: 10000,
        like_count: 500,
        collect_count: 200,
        comment_count: 80,
        share_count: 50,
        interact_rate: 8.3,
      },
      draft_create: { 
        testMode: true, 
        action, 
        draft_id: 'mock_draft_67890',
        title: args.title,
        created_at: new Date().toISOString(),
      },
      draft_list: { 
        testMode: true, 
        action, 
        drafts: [
          { draft_id: 'draft_1', title: '草稿1', content_type: 'image', created_at: new Date().toISOString() },
          { draft_id: 'draft_2', title: '草稿2', content_type: 'video', created_at: new Date().toISOString() },
        ],
        total: 2,
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
    const content = requireString(args, 'content')
    const contentType = optionalString(args, 'content_type') || 'image'
    const coverUrl = optionalString(args, 'cover_url')
    const topics = optionalArray(args, 'topics')
    const tags = optionalArray(args, 'tags')
    const location = optionalString(args, 'location')

    const payload: Record<string, unknown> = {
      title,
      content,
      content_type: contentType,
      cover_url: coverUrl,
      topics,
      tags,
      location,
    }

    if (contentType === 'image') {
      const images = optionalArray(args, 'images')
      if (images.length === 0) {
        throw new Error('图文笔记需要提供 images 数组（至少1张图片）')
      }
      if (images.length > 9) {
        throw new Error('图文笔记最多支持9张图片')
      }
      payload.images = images
    } else if (contentType === 'video') {
      const videoUrl = requireString(args, 'video_url')
      payload.video_url = videoUrl
    }

    const endpoint = getEnv('XHS_PUBLISH_ENDPOINT', '/note/publish')
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

  private async handleTopicSearch(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const keyword = requireString(args, 'keyword')
    const page = typeof args.page === 'number' ? args.page : 1
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 10

    const endpoint = getEnv('XHS_TOPIC_SEARCH_ENDPOINT', '/topic/search')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('keyword', keyword)
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

  private async handleTopicHot(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const category = optionalString(args, 'category') || 'all'
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 20

    const endpoint = getEnv('XHS_TOPIC_HOT_ENDPOINT', '/topic/hot')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('category', category)
    url.searchParams.set('limit', String(pageSize))
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleTagRecommend(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const keyword = optionalString(args, 'keyword') || ''
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 10

    const endpoint = getEnv('XHS_TAG_RECOMMEND_ENDPOINT', '/tag/recommend')
    const url = new URL(endpoint, baseUrl)
    if (keyword) url.searchParams.set('keyword', keyword)
    url.searchParams.set('limit', String(pageSize))
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse(response, startedAt)
  }

  private async handleStatus(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const noteId = requireString(args, 'note_id')

    const endpoint = getEnv('XHS_STATUS_ENDPOINT', '/note/status')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('note_id', noteId)
    
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
    const noteId = requireString(args, 'note_id')

    const endpoint = getEnv('XHS_STATS_ENDPOINT', '/note/stats')
    const url = new URL(endpoint, baseUrl)
    url.searchParams.set('note_id', noteId)
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${accessToken}`,
      },
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
    const content = optionalString(args, 'content') || ''
    const contentType = optionalString(args, 'content_type') || 'image'
    const images = optionalArray(args, 'images')
    const videoUrl = optionalString(args, 'video_url')
    const coverUrl = optionalString(args, 'cover_url')
    const topics = optionalArray(args, 'topics')
    const tags = optionalArray(args, 'tags')

    const payload: Record<string, unknown> = {
      title,
      content,
      content_type: contentType,
      images,
      video_url: videoUrl,
      cover_url: coverUrl,
      topics,
      tags,
    }

    const endpoint = getEnv('XHS_DRAFT_CREATE_ENDPOINT', '/note/draft/create')
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

  private async handleDraftList(
    args: Record<string, unknown>, 
    baseUrl: string, 
    accessToken: string, 
    startedAt: number
  ): Promise<ToolCallResult> {
    const page = typeof args.page === 'number' ? args.page : 1
    const pageSize = typeof args.page_size === 'number' ? args.page_size : 10

    const endpoint = getEnv('XHS_DRAFT_LIST_ENDPOINT', '/note/draft/list')
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
        error: `小红书 API 错误: HTTP ${response.status} ${response.statusText}`,
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
