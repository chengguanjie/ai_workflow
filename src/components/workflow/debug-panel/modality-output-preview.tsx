'use client'

import { useState } from 'react'
import {
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Hash,
  Download,
  ExternalLink,
  Copy,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ImageOutput {
  url?: string
  b64?: string
  revisedPrompt?: string
}

interface VideoOutput {
  url: string
  duration?: number
  format?: string
}

interface AudioOutput {
  url: string
  format?: string
  duration?: number
}

interface ModalityOutputPreviewProps {
  output: Record<string, unknown>
  className?: string
}

/**
 * 多模态输出预览组件
 * 根据输出类型自动显示合适的预览界面
 */
export function ModalityOutputPreview({ output, className }: ModalityOutputPreviewProps) {
  // 检测输出类型
  const outputType = detectOutputType(output)

  switch (outputType) {
    case 'image-gen':
      return <ImageGenPreview output={output} className={className} />
    case 'video-gen':
      return <VideoGenPreview output={output} className={className} />
    case 'audio-tts':
      return <AudioTTSPreview output={output} className={className} />
    case 'transcription':
      return <TranscriptionPreview output={output} className={className} />
    case 'embedding':
      return <EmbeddingPreview output={output} className={className} />
    default:
      return null
  }
}

/**
 * 检测输出类型
 */
function detectOutputType(output: Record<string, unknown>): string | null {
  if (output.images && Array.isArray(output.images)) {
    return 'image-gen'
  }
  if (output.videos && Array.isArray(output.videos)) {
    return 'video-gen'
  }
  if (output.audio && typeof output.audio === 'object') {
    return 'audio-tts'
  }
  if (output.segments && output.language) {
    return 'transcription'
  }
  if (output.embeddings && Array.isArray(output.embeddings)) {
    return 'embedding'
  }
  return null
}

/**
 * 图片生成预览
 */
function ImageGenPreview({ output, className }: { output: Record<string, unknown>; className?: string }) {
  const images = (output.images as ImageOutput[]) || []
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageLoadError, setImageLoadError] = useState<Record<number, boolean>>({})

  if (images.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8 bg-muted/30 rounded-lg", className)}>
        <p className="text-sm text-muted-foreground">暂无图片输出</p>
      </div>
    )
  }

  const currentImage = images[currentIndex]
  const imageUrl = currentImage?.url || (currentImage?.b64 ? `data:image/png;base64,${currentImage.b64}` : '')

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `generated-image-${index + 1}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('下载失败:', error)
      // 直接打开链接
      window.open(url, '_blank')
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* 图片计数 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">生成的图片</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {currentIndex + 1} / {images.length}
        </Badge>
      </div>

      {/* 图片显示区域 */}
      <div className="relative group rounded-lg overflow-hidden bg-muted/30 border">
        {imageLoadError[currentIndex] ? (
          <div className="flex flex-col items-center justify-center p-8 min-h-[200px]">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">图片加载失败</p>
            <Button
              variant="link"
              size="sm"
              onClick={() => window.open(imageUrl, '_blank')}
              className="mt-2"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              在新窗口打开
            </Button>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`Generated image ${currentIndex + 1}`}
            className="w-full h-auto max-h-[400px] object-contain"
            onError={() => setImageLoadError(prev => ({ ...prev, [currentIndex]: true }))}
          />
        )}

        {/* 图片导航按钮 */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
              onClick={() => setCurrentIndex(prev => (prev - 1 + images.length) % images.length)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
              onClick={() => setCurrentIndex(prev => (prev + 1) % images.length)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* 工具栏 */}
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={() => window.open(imageUrl, '_blank')}
            title="全屏查看"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleDownload(imageUrl, currentIndex)}
            title="下载图片"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 缩略图列表 */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((img, i) => {
            const thumbUrl = img.url || (img.b64 ? `data:image/png;base64,${img.b64}` : '')
            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all",
                  currentIndex === i ? "border-primary" : "border-transparent hover:border-primary/50"
                )}
              >
                <img
                  src={thumbUrl}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            )
          })}
        </div>
      )}

      {/* 优化后的提示词 */}
      {currentImage?.revisedPrompt && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700 font-medium mb-1">优化后的提示词：</p>
          <p className="text-xs text-blue-600">{currentImage.revisedPrompt}</p>
        </div>
      )}
    </div>
  )
}

/**
 * 视频生成预览
 */
function VideoGenPreview({ output, className }: { output: Record<string, unknown>; className?: string }) {
  const videos = (output.videos as VideoOutput[]) || []
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const taskId = output.taskId as string

  if (videos.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg", className)}>
        <Video className="h-12 w-12 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">暂无视频输出</p>
        {taskId && (
          <p className="text-xs text-muted-foreground mt-1">任务ID: {taskId}</p>
        )}
      </div>
    )
  }

  const currentVideo = videos[currentIndex]

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `generated-video-${index + 1}.${currentVideo.format || 'mp4'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* 视频计数 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">生成的视频</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {currentIndex + 1} / {videos.length}
        </Badge>
      </div>

      {/* 视频播放器 */}
      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          src={currentVideo.url}
          controls
          className="w-full max-h-[400px]"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          您的浏览器不支持视频播放
        </video>
      </div>

      {/* 视频信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {currentVideo.duration && (
            <span>时长: {currentVideo.duration}s</span>
          )}
          {currentVideo.format && (
            <span>格式: {currentVideo.format.toUpperCase()}</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDownload(currentVideo.url, currentIndex)}
          className="h-7 text-xs"
        >
          <Download className="h-3 w-3 mr-1" />
          下载
        </Button>
      </div>

      {/* 视频列表 */}
      {videos.length > 1 && (
        <div className="grid grid-cols-3 gap-2">
          {videos.map((video, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "p-2 rounded-md border-2 transition-all flex items-center justify-center gap-2",
                currentIndex === i ? "border-primary bg-primary/5" : "border-transparent hover:border-primary/50 bg-muted/30"
              )}
            >
              <Video className="h-4 w-4" />
              <span className="text-xs">视频 {i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 音频 TTS 预览
 */
function AudioTTSPreview({ output, className }: { output: Record<string, unknown>; className?: string }) {
  const audio = output.audio as AudioOutput
  const text = output.text as string
  const [isPlaying, setIsPlaying] = useState(false)

  if (!audio?.url) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg", className)}>
        <Music className="h-12 w-12 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">暂无音频输出</p>
      </div>
    )
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = audio.url
    a.download = `generated-audio.${audio.format || 'mp3'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Music className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">生成的音频</span>
      </div>

      {/* 音频播放器 */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <audio
          src={audio.url}
          controls
          className="w-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          您的浏览器不支持音频播放
        </audio>
      </div>

      {/* 音频信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {audio.format && (
            <span>格式: {audio.format.toUpperCase()}</span>
          )}
          {audio.duration && (
            <span>时长: {audio.duration}s</span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="h-7 text-xs"
        >
          <Download className="h-3 w-3 mr-1" />
          下载
        </Button>
      </div>

      {/* 原文本 */}
      {text && (
        <div className="p-3 bg-muted/30 rounded-lg border">
          <p className="text-xs text-muted-foreground font-medium mb-1">转换的文本：</p>
          <p className="text-sm">{text}</p>
        </div>
      )}
    </div>
  )
}

/**
 * 音频转录预览
 */
function TranscriptionPreview({ output, className }: { output: Record<string, unknown>; className?: string }) {
  const text = output['结果'] as string || output.text as string
  const segments = output.segments as Array<{ start: number; end: number; text: string }> | undefined
  const language = output.language as string
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">转录结果</span>
        </div>
        {language && (
          <Badge variant="secondary" className="text-xs">
            {language}
          </Badge>
        )}
      </div>

      {/* 转录文本 */}
      <div className="relative p-4 bg-muted/30 rounded-lg border">
        <p className="text-sm whitespace-pre-wrap pr-8">{text}</p>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* 时间戳分段（可选） */}
      {segments && segments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">时间分段：</p>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {segments.map((seg, i) => (
              <div key={i} className="flex gap-2 text-xs p-2 bg-muted/20 rounded">
                <span className="text-muted-foreground font-mono w-20 flex-shrink-0">
                  {formatTime(seg.start)} - {formatTime(seg.end)}
                </span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 向量嵌入预览
 */
function EmbeddingPreview({ output, className }: { output: Record<string, unknown>; className?: string }) {
  const embeddings = output.embeddings as number[][] || []
  const dimensions = output.dimensions as number
  const [showFull, setShowFull] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(embeddings))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (embeddings.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg", className)}>
        <Hash className="h-12 w-12 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">暂无向量输出</p>
      </div>
    )
  }

  const firstEmbedding = embeddings[0]
  const displayValues = showFull ? firstEmbedding : firstEmbedding.slice(0, 20)

  return (
    <div className={cn("space-y-3", className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">向量嵌入</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {embeddings.length} 个向量
          </Badge>
          {dimensions && (
            <Badge variant="outline" className="text-xs">
              {dimensions} 维
            </Badge>
          )}
        </div>
      </div>

      {/* 向量预览 */}
      <div className="relative p-4 bg-muted/30 rounded-lg border font-mono text-xs">
        <div className="flex flex-wrap gap-1">
          {displayValues.map((val, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 bg-white rounded border text-[10px]"
              title={val.toString()}
            >
              {val.toFixed(4)}
            </span>
          ))}
          {!showFull && firstEmbedding.length > 20 && (
            <button
              onClick={() => setShowFull(true)}
              className="px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 text-[10px]"
            >
              +{firstEmbedding.length - 20} 更多
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7"
          onClick={handleCopy}
          title="复制向量"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 bg-muted/30 rounded text-center">
          <p className="text-muted-foreground">最小值</p>
          <p className="font-mono">{Math.min(...firstEmbedding).toFixed(4)}</p>
        </div>
        <div className="p-2 bg-muted/30 rounded text-center">
          <p className="text-muted-foreground">最大值</p>
          <p className="font-mono">{Math.max(...firstEmbedding).toFixed(4)}</p>
        </div>
        <div className="p-2 bg-muted/30 rounded text-center">
          <p className="text-muted-foreground">平均值</p>
          <p className="font-mono">
            {(firstEmbedding.reduce((a, b) => a + b, 0) / firstEmbedding.length).toFixed(4)}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
