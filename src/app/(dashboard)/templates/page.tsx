/**
 * 工作流模板库页面
 * 支持外部模板库（平台推送）和内部模板库（企业分享）
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  Star,
  Users,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Building2,
  Globe2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEPARTMENT_CATEGORIES,
  getCategoryName,
  getCategoryIcon,
} from '@/lib/constants/template-categories'

// 模板库类型
type TemplateLibraryType = 'external' | 'internal'

// 每页显示的模板数量
const TEMPLATES_PER_PAGE = 9

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
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [libraryType, setLibraryType] = useState<TemplateLibraryType>('external')
  const [currentPage, setCurrentPage] = useState(1)


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
    // 根据库类型设置不同的查询参数
    if (libraryType === 'external') {
      params.set('templateType', 'PUBLIC')
      params.set('includeOfficial', 'true')
    } else {
      params.set('templateType', 'INTERNAL')
      params.set('includeOfficial', 'false')
    }
    // 设置较大的 limit 以获取所有模板（前端使用客户端分页）
    params.set('limit', '100')

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
  }, [selectedCategory, searchQuery, libraryType])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 当筛选条件改变时重置页码
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategory, searchQuery, libraryType])

  // 分页计算
  const paginationData = useMemo(() => {
    const totalItems = templates.length
    const totalPages = Math.ceil(totalItems / TEMPLATES_PER_PAGE)
    const startIndex = (currentPage - 1) * TEMPLATES_PER_PAGE
    const endIndex = startIndex + TEMPLATES_PER_PAGE
    const currentTemplates = templates.slice(startIndex, endIndex)

    return {
      totalItems,
      totalPages,
      currentTemplates,
      startIndex,
      endIndex: Math.min(endIndex, totalItems),
    }
  }, [templates, currentPage])

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


  return (
    <div className="h-full bg-gray-50 overflow-hidden flex flex-col">
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex flex-col overflow-hidden">
        {/* 提示消息 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 flex-shrink-0">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 flex-shrink-0">
            <CheckCircle className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        <div className="flex gap-6 flex-1 overflow-hidden">
          {/* 左侧分类筛选 */}
          <div className="w-64 flex-shrink-0 flex flex-col overflow-hidden">
            <div className="bg-white rounded-lg shadow-sm border p-4 flex flex-col overflow-hidden flex-1">
              <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2 flex-shrink-0">
                <Filter className="w-4 h-4" />
                分类筛选
              </h2>

              <div className="space-y-1 overflow-y-auto flex-1">
                {/* 全部模板 */}
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

                {/* 部门分类 */}
                {DEPARTMENT_CATEGORIES.map((category) => {
                  const CategoryIcon = getCategoryIcon(category.id)
                  return (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-sm rounded-md transition-colors flex items-center gap-2',
                        selectedCategory === category.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                      title={category.description}
                    >
                      <CategoryIcon className="w-4 h-4" />
                      {category.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 搜索栏和模板库类型切换 */}
            <div className="mb-6 flex items-center gap-4 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索模板名称或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {/* 外部/内部模板库切换 */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setLibraryType('external')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    libraryType === 'external'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  <Globe2 className="w-4 h-4" />
                  外部模板库
                </button>
                <button
                  onClick={() => setLibraryType('internal')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    libraryType === 'internal'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  <Building2 className="w-4 h-4" />
                  内部模板库
                </button>
              </div>
            </div>

            {/* 模板列表 */}
            {isLoading ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-500">加载中...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center flex-1 flex flex-col items-center justify-center">
                <div className="text-gray-400 mb-2">
                  {libraryType === 'internal' ? (
                    <Building2 className="w-12 h-12 mx-auto" />
                  ) : (
                    <Search className="w-12 h-12 mx-auto" />
                  )}
                </div>
                <p className="text-gray-500">
                  {libraryType === 'internal'
                    ? '内部模板库暂无模板'
                    : '未找到匹配的模板'}
                </p>
                {libraryType === 'internal' && (
                  <p className="mt-1 text-sm text-gray-400">
                    您可以在工作流列表中右键点击工作流，选择「分享到内部模板库」
                  </p>
                )}
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
              <div className="flex-1 flex flex-col overflow-auto">
                {/* 模板网格 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                  {paginationData.currentTemplates.map((template) => {
                    const CategoryIcon = getCategoryIcon(template.category)
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

                {/* 分页控件 */}
                {paginationData.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 mt-4 border-t flex-shrink-0">
                    <div className="text-sm text-gray-500">
                      显示 {paginationData.startIndex + 1}-{paginationData.endIndex} / 共 {paginationData.totalItems} 个模板
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        上一页
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: paginationData.totalPages }, (_, i) => i + 1)
                          .filter((page) => {
                            // 显示第一页、最后一页、当前页及其前后页
                            if (page === 1 || page === paginationData.totalPages) return true
                            if (Math.abs(page - currentPage) <= 1) return true
                            return false
                          })
                          .map((page, index, array) => {
                            // 检查是否需要显示省略号
                            const showEllipsis = index > 0 && page - array[index - 1] > 1
                            return (
                              <span key={page} className="flex items-center">
                                {showEllipsis && (
                                  <span className="px-2 text-gray-400">...</span>
                                )}
                                <button
                                  onClick={() => setCurrentPage(page)}
                                  className={cn(
                                    'w-8 h-8 text-sm font-medium rounded-md transition-colors',
                                    currentPage === page
                                      ? 'bg-blue-500 text-white'
                                      : 'hover:bg-gray-100 text-gray-600'
                                  )}
                                >
                                  {page}
                                </button>
                              </span>
                            )
                          })}
                      </div>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(paginationData.totalPages, p + 1))}
                        disabled={currentPage === paginationData.totalPages}
                        className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        下一页
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
