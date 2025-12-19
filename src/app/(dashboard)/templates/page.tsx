/**
 * 工作流模板库页面
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  Brain,
  BarChart,
  FileText,
  PenTool,
  Image,
  Globe,
  Zap,
  MessageCircle,
  MoreHorizontal,
  Star,
  Users,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 分类图标映射
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'ai-processing': Brain,
  'data-analysis': BarChart,
  'document-generation': FileText,
  'content-creation': PenTool,
  'image-processing': Image,
  translation: Globe,
  automation: Zap,
  qa: MessageCircle,
  other: MoreHorizontal,
}

interface Category {
  id: string
  name: string
  icon: string
  description: string
}

interface Template {
  id: string
  name: string
  description: string | null
  category: string
  tags: string[]
  thumbnail: string | null
  usageCount: number
  rating: number
  ratingCount: number
  isOfficial: boolean
  creatorName: string | null
  createdAt: string
}

export default function TemplatesPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // 加载分类
  useEffect(() => {
    fetch('/api/templates/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setCategories(data.data.categories)
        }
      })
      .catch(console.error)
  }, [])

  // 加载模板
  const loadTemplates = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (selectedCategory) {
      params.set('category', selectedCategory)
    }
    if (searchQuery) {
      params.set('search', searchQuery)
    }
    params.set('includeOfficial', 'true')

    try {
      const res = await fetch(`/api/templates?${params.toString()}`)
      const data = await res.json()

      if (data.success) {
        setTemplates(data.data.templates)
      } else {
        setError(data.error?.message || '加载模板失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [selectedCategory, searchQuery])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 使用模板创建工作流
  const handleUseTemplate = async (templateId: string, templateName: string) => {
    setIsCreating(templateId)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`/api/templates/${templateId}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (data.success) {
        setSuccessMessage(`已从模板 "${templateName}" 创建工作流`)
        // 跳转到新工作流编辑页面
        setTimeout(() => {
          router.push(`/workflows/${data.data.id}`)
        }, 1000)
      } else {
        setError(data.error?.message || '创建工作流失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setIsCreating(null)
    }
  }

  // 获取分类名称
  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || categoryId
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面标题 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">工作流模板库</h1>
          <p className="mt-1 text-sm text-gray-500">
            浏览和使用预设的工作流模板，快速开始您的自动化任务
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 提示消息 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        <div className="flex gap-6">
          {/* 左侧分类筛选 */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                分类筛选
              </h2>

              <div className="space-y-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm rounded-md transition-colors',
                    selectedCategory === null
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  全部模板
                </button>

                {categories.map((category) => {
                  const Icon = CATEGORY_ICONS[category.id] || MoreHorizontal
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm rounded-md transition-colors flex items-center gap-2',
                        selectedCategory === category.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {category.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1">
            {/* 搜索栏 */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索模板名称或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* 模板列表 */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-500">加载中...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-2">
                  <Search className="w-12 h-12 mx-auto" />
                </div>
                <p className="text-gray-500">未找到匹配的模板</p>
                {(selectedCategory || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedCategory(null)
                      setSearchQuery('')
                    }}
                    className="mt-2 text-blue-500 hover:text-blue-600 text-sm"
                  >
                    清除筛选条件
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => {
                  const CategoryIcon = CATEGORY_ICONS[template.category] || MoreHorizontal
                  return (
                    <div
                      key={template.id}
                      className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
                    >
                      {/* 模板头部 */}
                      <div className="p-4 border-b">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                              <CategoryIcon className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 flex items-center gap-1">
                                {template.name}
                                {template.isOfficial && (
                                  <Sparkles className="w-4 h-4 text-yellow-500" />
                                )}
                              </h3>
                              <p className="text-xs text-gray-500">
                                {getCategoryName(template.category)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                          {template.description || '暂无描述'}
                        </p>
                      </div>

                      {/* 标签 */}
                      {template.tags.length > 0 && (
                        <div className="px-4 py-2 flex flex-wrap gap-1">
                          {template.tags.slice(0, 3).map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {template.tags.length > 3 && (
                            <span className="px-2 py-0.5 text-xs text-gray-400">
                              +{template.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 模板底部 */}
                      <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {template.usageCount}
                          </span>
                          {template.rating > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                              {template.rating.toFixed(1)}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleUseTemplate(template.id, template.name)}
                          disabled={isCreating === template.id}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {isCreating === template.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              创建中...
                            </>
                          ) : (
                            <>
                              使用模板
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
