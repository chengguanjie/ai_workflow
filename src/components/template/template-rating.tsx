'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Star, Loader2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RatingStats {
  averageScore: number
  totalRatings: number
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}

interface RatingItem {
  id: string
  score: number
  comment: string | null
  userId: string
  userName: string | null
  createdAt: string
}

interface MyRating {
  score: number
  comment: string | null
}

interface TemplateRatingProps {
  templateId: string
  readonly?: boolean
  compact?: boolean
  onRatingChange?: () => void
}

// 星级组件
function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
}: {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const [hoverValue, setHoverValue] = useState(0)

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          className={cn(
            'transition-colors',
            readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
          )}
          onMouseEnter={() => !readonly && setHoverValue(star)}
          onMouseLeave={() => !readonly && setHoverValue(0)}
          onClick={() => onChange?.(star)}
        >
          <Star
            className={cn(
              sizeClasses[size],
              (hoverValue || value) >= star
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            )}
          />
        </button>
      ))}
    </div>
  )
}

// 评分分布条
function RatingDistribution({
  distribution,
  total,
}: {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
  total: number
}) {
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map((score) => {
        const count = distribution[score as 1 | 2 | 3 | 4 | 5] || 0
        const percentage = total > 0 ? (count / total) * 100 : 0

        return (
          <div key={score} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right">{score}</span>
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-8 text-right text-muted-foreground">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

export function TemplateRating({
  templateId,
  readonly = false,
  compact = false,
  onRatingChange,
}: TemplateRatingProps) {
  const [stats, setStats] = useState<RatingStats | null>(null)
  const [myRating, setMyRating] = useState<MyRating | null>(null)
  const [ratings, setRatings] = useState<RatingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // 评分表单
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')

  useEffect(() => {
    loadRatings()
  }, [templateId])

  const loadRatings = async () => {
    try {
      const res = await fetch(`/api/templates/${templateId}/ratings`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setMyRating(data.myRating)
        setRatings(data.data || [])

        // 如果已有评分，预填表单
        if (data.myRating) {
          setScore(data.myRating.score)
          setComment(data.myRating.comment || '')
        }
      }
    } catch (error) {
      console.error('Failed to load ratings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (score === 0) {
      toast.error('请选择评分')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/templates/${templateId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment: comment.trim() || undefined }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || '提交失败')
      }

      const data = await res.json()
      setStats(data.stats)
      setMyRating(data.myRating)
      setDialogOpen(false)
      toast.success(myRating ? '评分已更新' : '感谢您的评分')
      onRatingChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交评分失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  if (compact) {
    // 紧凑模式：只显示评分和数量
    return (
      <div className="flex items-center gap-1.5">
        <StarRating value={Math.round(stats?.averageScore || 0)} readonly size="sm" />
        <span className="text-sm font-medium">
          {stats?.averageScore?.toFixed(1) || '0.0'}
        </span>
        <span className="text-xs text-muted-foreground">
          ({stats?.totalRatings || 0})
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 评分概览 */}
      <div className="flex items-start gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold">
            {stats?.averageScore?.toFixed(1) || '0.0'}
          </div>
          <StarRating value={Math.round(stats?.averageScore || 0)} readonly />
          <div className="text-sm text-muted-foreground mt-1">
            {stats?.totalRatings || 0} 人评分
          </div>
        </div>

        <div className="flex-1">
          <RatingDistribution
            distribution={stats?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }}
            total={stats?.totalRatings || 0}
          />
        </div>
      </div>

      {/* 我的评分 / 评分按钮 */}
      {!readonly && (
        <div className="pt-4 border-t">
          {myRating ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">我的评分</div>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating value={myRating.score} readonly size="sm" />
                  {myRating.comment && (
                    <span className="text-sm text-muted-foreground line-clamp-1">
                      {myRating.comment}
                    </span>
                  )}
                </div>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    修改评分
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>修改评分</DialogTitle>
                    <DialogDescription>
                      更新您对这个模板的评分和评论
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex flex-col items-center gap-2">
                      <StarRating value={score} onChange={setScore} size="lg" />
                      <span className="text-sm text-muted-foreground">
                        点击星星评分
                      </span>
                    </div>
                    <Textarea
                      placeholder="写下您的评论（可选）"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        '提交'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Star className="h-4 w-4 mr-2" />
                  评价这个模板
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>评价模板</DialogTitle>
                  <DialogDescription>
                    分享您对这个模板的使用体验
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex flex-col items-center gap-2">
                    <StarRating value={score} onChange={setScore} size="lg" />
                    <span className="text-sm text-muted-foreground">
                      点击星星评分
                    </span>
                  </div>
                  <Textarea
                    placeholder="写下您的评论（可选）"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting || score === 0}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      '提交评分'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* 评论列表 */}
      {ratings.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4" />
            评论 ({ratings.filter((r) => r.comment).length})
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {ratings
              .filter((r) => r.comment)
              .map((rating) => (
                <div key={rating.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {rating.userName?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {rating.userName || '匿名用户'}
                      </span>
                      <StarRating value={rating.score} readonly size="sm" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {rating.comment}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(rating.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
