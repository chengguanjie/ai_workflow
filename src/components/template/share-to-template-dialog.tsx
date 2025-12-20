/**
 * 分享工作流到内部模板库对话框
 */

'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, X, Share2 } from 'lucide-react'
import { toast } from 'sonner'

// 模板分类
const TEMPLATE_CATEGORIES = [
  // 功能分类
  { id: 'ai-processing', name: 'AI处理' },
  { id: 'data-analysis', name: '数据分析' },
  { id: 'document-generation', name: '文档生成' },
  { id: 'content-creation', name: '内容创作' },
  { id: 'image-processing', name: '图像处理' },
  { id: 'translation', name: '翻译' },
  { id: 'automation', name: '自动化' },
  { id: 'qa', name: '问答' },
  // 部门分类
  { id: 'sales', name: '销售' },
  { id: 'marketing', name: '市场' },
  { id: 'hr', name: '人力资源' },
  { id: 'finance', name: '财务' },
  { id: 'operation', name: '运营' },
  { id: 'product', name: '产品' },
  { id: 'admin', name: '行政' },
  { id: 'legal', name: '法务' },
  { id: 'other', name: '其他' },
]

// 可见性选项
const VISIBILITY_OPTIONS = [
  { value: 'PRIVATE', label: '仅自己可见', description: '只有您能看到此模板' },
  { value: 'ORGANIZATION', label: '企业内可见', description: '企业内所有成员都能看到' },
]

interface ShareToTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  workflowName: string
  workflowDescription?: string | null
  onSuccess?: () => void
}

export function ShareToTemplateDialog({
  open,
  onOpenChange,
  workflowId,
  workflowName,
  workflowDescription,
  onSuccess,
}: ShareToTemplateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('other')
  const [visibility, setVisibility] = useState('ORGANIZATION')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // 重置表单
  useEffect(() => {
    if (open) {
      setName(workflowName)
      setDescription(workflowDescription || '')
      setCategory('other')
      setVisibility('ORGANIZATION')
      setTags([])
      setTagInput('')
    }
  }, [open, workflowName, workflowDescription])

  // 添加标签
  const handleAddTag = () => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 10) {
      setTags([...tags, trimmedTag])
      setTagInput('')
    }
  }

  // 移除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove))
  }

  // 处理标签输入回车
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  // 提交分享
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('请输入模板名称')
      return
    }

    if (!category) {
      toast.error('请选择模板分类')
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch(`/api/workflows/${workflowId}/share-to-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          tags,
          visibility,
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success('已成功分享到内部模板库')
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(data.error?.message || '分享失败')
      }
    } catch {
      toast.error('网络错误，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-500" />
            分享到内部模板库
          </DialogTitle>
          <DialogDescription>
            将工作流分享为模板，让企业内其他成员也能使用
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 模板名称 */}
          <div className="space-y-2">
            <Label htmlFor="name">模板名称 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入模板名称"
              maxLength={50}
            />
          </div>

          {/* 模板描述 */}
          <div className="space-y-2">
            <Label htmlFor="description">模板描述</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个模板的用途和功能"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* 分类选择 */}
          <div className="space-y-2">
            <Label htmlFor="category">分类 *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 可见性 */}
          <div className="space-y-2">
            <Label htmlFor="visibility">可见性</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger>
                <SelectValue placeholder="选择可见性" />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 标签 */}
          <div className="space-y-2">
            <Label htmlFor="tags">标签</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="输入标签后按回车添加"
                maxLength={20}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || tags.length >= 10}
              >
                添加
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {tag}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              最多添加10个标签，帮助其他人更容易找到这个模板
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                分享中...
              </>
            ) : (
              '分享'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
