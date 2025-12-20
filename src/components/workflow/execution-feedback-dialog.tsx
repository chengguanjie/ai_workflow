'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Star, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ISSUE_CATEGORIES = [
  { id: 'KNOWLEDGE_BASE', label: '知识库内容不完整' },
  { id: 'PROMPT_UNCLEAR', label: '提示词不够具体' },
  { id: 'PROMPT_WRONG', label: '提示词逻辑错误' },
  { id: 'MODEL_CAPABILITY', label: '模型理解能力不足' },
  { id: 'MODEL_CONFIG', label: '模型参数配置不当' },
  { id: 'INPUT_QUALITY', label: '输入信息不清晰' },
  { id: 'CONTEXT_MISSING', label: '上下文信息缺失' },
  { id: 'OTHER', label: '其他原因' },
] as const

interface ExecutionFeedbackDialogProps {
  executionId: string
  actualOutput?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit?: (feedbackId: string) => void
}

export function ExecutionFeedbackDialog({
  executionId,
  actualOutput,
  open,
  onOpenChange,
  onSubmit,
}: ExecutionFeedbackDialogProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [isAccurate, setIsAccurate] = useState<boolean | null>(null)
  const [expectedOutput, setExpectedOutput] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [requestDiagnosis, setRequestDiagnosis] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('请给出评分')
      return
    }

    if (isAccurate === null) {
      toast.error('请选择结果是否准确')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/executions/${executionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          isAccurate,
          expectedOutput: expectedOutput || undefined,
          feedbackComment: feedbackComment || undefined,
          issueCategories: selectedCategories,
          requestDiagnosis,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '提交失败')
      }

      const result = await response.json()

      toast.success(
        requestDiagnosis
          ? '反馈已提交，AI 正在分析...'
          : '感谢您的反馈!'
      )

      // 重置表单
      setRating(0)
      setIsAccurate(null)
      setExpectedOutput('')
      setFeedbackComment('')
      setSelectedCategories([])

      onOpenChange(false)
      onSubmit?.(result.data.feedback.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>执行结果反馈</DialogTitle>
          <DialogDescription>
            您的反馈将帮助我们持续优化工作流
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 评分 */}
          <div className="space-y-2">
            <Label>这个结果对您有帮助吗？</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-1 transition-transform hover:scale-110"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                >
                  <Star
                    className={cn(
                      'h-7 w-7 transition-colors',
                      (hoverRating || rating) >= star
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    )}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {rating > 0 && `${rating}/5`}
              </span>
            </div>
          </div>

          {/* 准确性 */}
          <div className="space-y-2">
            <Label>结果是否准确？</Label>
            <RadioGroup
              value={isAccurate === null ? '' : isAccurate ? 'accurate' : 'inaccurate'}
              onValueChange={(value) => setIsAccurate(value === 'accurate')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="accurate" id="accurate" />
                <Label htmlFor="accurate" className="font-normal">
                  结果准确，符合预期
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inaccurate" id="inaccurate" />
                <Label htmlFor="inaccurate" className="font-normal">
                  结果不够准确
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* 期望输出（仅当结果不准确时显示） */}
          {isAccurate === false && (
            <>
              <div className="space-y-2">
                <Label htmlFor="expectedOutput">期望的正确答案（可选）</Label>
                <Textarea
                  id="expectedOutput"
                  placeholder="请描述您期望的结果..."
                  value={expectedOutput}
                  onChange={(e) => setExpectedOutput(e.target.value)}
                  rows={3}
                />
              </div>

              {/* 问题分类 */}
              <div className="space-y-2">
                <Label>问题可能出在哪里？（可多选）</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ISSUE_CATEGORIES.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={category.id}
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={() => handleCategoryToggle(category.id)}
                      />
                      <Label
                        htmlFor={category.id}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {category.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 补充说明 */}
          <div className="space-y-2">
            <Label htmlFor="feedbackComment">补充说明（可选）</Label>
            <Textarea
              id="feedbackComment"
              placeholder="有什么其他想说的..."
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              rows={2}
            />
          </div>

          {/* AI 诊断选项 */}
          {isAccurate === false && (
            <div className="flex items-center space-x-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
              <Checkbox
                id="requestDiagnosis"
                checked={requestDiagnosis}
                onCheckedChange={(checked) =>
                  setRequestDiagnosis(checked as boolean)
                }
              />
              <Label
                htmlFor="requestDiagnosis"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span className="text-sm">
                  请求 AI 诊断并获取优化建议
                </span>
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleSkip}>
            跳过
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {requestDiagnosis && isAccurate === false
              ? '提交并请求AI诊断'
              : '提交反馈'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
