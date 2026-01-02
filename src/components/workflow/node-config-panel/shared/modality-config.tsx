'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Image, Video, Music, FileText, Hash, Mic } from 'lucide-react'
import type { ModelModality } from '@/lib/ai/types'

interface ModalityConfigProps {
  modality: ModelModality | null
  config: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}

/**
 * 根据模型模态显示特定的配置选项
 */
export function ModalityConfig({ modality, config, onChange }: ModalityConfigProps) {
  if (!modality || modality === 'text' || modality === 'code') {
    return null
  }

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {getModalityIcon(modality)}
        <span>{getModalityLabel(modality)} 配置</span>
      </div>

      {modality === 'image-gen' && (
        <ImageGenConfig config={config} onChange={onChange} />
      )}

      {modality === 'video-gen' && (
        <VideoGenConfig config={config} onChange={onChange} />
      )}

      {modality === 'audio-tts' && (
        <TTSConfig config={config} onChange={onChange} />
      )}

      {modality === 'audio-transcription' && (
        <TranscriptionConfig config={config} onChange={onChange} />
      )}

      {modality === 'embedding' && (
        <EmbeddingConfig config={config} onChange={onChange} />
      )}

      {modality === 'ocr' && (
        <OCRConfig />
      )}
    </div>
  )
}

function getModalityIcon(modality: ModelModality) {
  switch (modality) {
    case 'image-gen':
      return <Image className="h-4 w-4" />
    case 'video-gen':
      return <Video className="h-4 w-4" />
    case 'audio-tts':
      return <Music className="h-4 w-4" />
    case 'audio-transcription':
      return <Mic className="h-4 w-4" />
    case 'embedding':
      return <Hash className="h-4 w-4" />
    case 'ocr':
      return <FileText className="h-4 w-4" />
    default:
      return null
  }
}

function getModalityLabel(modality: ModelModality): string {
  switch (modality) {
    case 'image-gen':
      return '图片生成'
    case 'video-gen':
      return '视频生成'
    case 'audio-tts':
      return '文本转语音'
    case 'audio-transcription':
      return '音频转录'
    case 'embedding':
      return '向量嵌入'
    case 'ocr':
      return '图文识别'
    default:
      return ''
  }
}

/**
 * 图片生成配置
 */
function ImageGenConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">图片尺寸</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.imageSize as string) || '1024x1024'}
          onChange={(e) => onChange('imageSize', e.target.value)}
        >
          <option value="1024x1024">1024 × 1024 (正方形)</option>
          <option value="1792x1024">1792 × 1024 (横版 16:9)</option>
          <option value="1024x1792">1024 × 1792 (竖版 9:16)</option>
          <option value="512x512">512 × 512 (小尺寸)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">生成数量</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={(config.imageCount as number) || 1}
            onChange={(e) => onChange('imageCount', parseInt(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">质量</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={(config.imageQuality as string) || 'standard'}
            onChange={(e) => onChange('imageQuality', e.target.value)}
          >
            <option value="standard">标准</option>
            <option value="hd">高清 (HD)</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">风格</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.imageStyle as string) || 'vivid'}
          onChange={(e) => onChange('imageStyle', e.target.value)}
        >
          <option value="vivid">生动 (Vivid)</option>
          <option value="natural">自然 (Natural)</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">负面提示词（可选）</Label>
        <Textarea
          className="min-h-[60px] text-sm"
          placeholder="描述不想出现的内容..."
          value={(config.negativePrompt as string) || ''}
          onChange={(e) => onChange('negativePrompt', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          描述你不希望在图片中出现的元素
        </p>
      </div>
    </div>
  )
}

/**
 * 视频生成配置
 */
function VideoGenConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">视频时长（秒）</Label>
          <span className="text-xs text-muted-foreground">{(config.videoDuration as number) || 5}s</span>
        </div>
        <Slider
          value={[(config.videoDuration as number) || 5]}
          onValueChange={([v]) => onChange('videoDuration', v)}
          min={1}
          max={30}
          step={1}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">宽高比</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={(config.videoAspectRatio as string) || '16:9'}
            onChange={(e) => onChange('videoAspectRatio', e.target.value)}
          >
            <option value="16:9">16:9 (横版)</option>
            <option value="9:16">9:16 (竖版)</option>
            <option value="1:1">1:1 (正方形)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">分辨率</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={(config.videoResolution as string) || '1080p'}
            onChange={(e) => onChange('videoResolution', e.target.value)}
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4k">4K</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">参考图片 URL（可选，图生视频）</Label>
        <Input
          type="url"
          placeholder="https://example.com/image.jpg"
          value={(config.referenceImage as string) || ''}
          onChange={(e) => onChange('referenceImage', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          提供参考图片可生成与图片风格一致的视频
        </p>
      </div>
    </div>
  )
}

/**
 * TTS 配置
 */
function TTSConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">音色</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.ttsVoice as string) || 'alloy'}
          onChange={(e) => onChange('ttsVoice', e.target.value)}
        >
          <option value="alloy">Alloy (中性)</option>
          <option value="echo">Echo (男声)</option>
          <option value="fable">Fable (男声-英式)</option>
          <option value="onyx">Onyx (男声-低沉)</option>
          <option value="nova">Nova (女声)</option>
          <option value="shimmer">Shimmer (女声-柔和)</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">语速</Label>
          <span className="text-xs text-muted-foreground">{((config.ttsSpeed as number) || 1.0).toFixed(1)}x</span>
        </div>
        <Slider
          value={[(config.ttsSpeed as number) || 1.0]}
          onValueChange={([v]) => onChange('ttsSpeed', v)}
          min={0.25}
          max={4.0}
          step={0.25}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">输出格式</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.ttsFormat as string) || 'mp3'}
          onChange={(e) => onChange('ttsFormat', e.target.value)}
        >
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="opus">OPUS</option>
        </select>
      </div>
    </div>
  )
}

/**
 * 音频转录配置
 */
function TranscriptionConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">语言（可选）</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.transcriptionLanguage as string) || ''}
          onChange={(e) => onChange('transcriptionLanguage', e.target.value)}
        >
          <option value="">自动检测</option>
          <option value="zh">中文</option>
          <option value="en">英语</option>
          <option value="ja">日语</option>
          <option value="ko">韩语</option>
          <option value="es">西班牙语</option>
          <option value="fr">法语</option>
          <option value="de">德语</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">输出格式</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={(config.transcriptionFormat as string) || 'json'}
          onChange={(e) => onChange('transcriptionFormat', e.target.value)}
        >
          <option value="json">JSON（含时间戳）</option>
          <option value="text">纯文本</option>
          <option value="srt">SRT 字幕</option>
          <option value="vtt">VTT 字幕</option>
        </select>
      </div>
    </div>
  )
}

/**
 * 向量嵌入配置
 */
function EmbeddingConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">向量维度（可选）</Label>
        <Input
          type="number"
          min={256}
          max={3072}
          placeholder="使用模型默认维度"
          value={(config.embeddingDimensions as number) || ''}
          onChange={(e) => onChange('embeddingDimensions', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <p className="text-xs text-muted-foreground">
          留空使用模型默认维度，某些模型支持自定义维度
        </p>
      </div>
    </div>
  )
}

/**
 * OCR 配置（目前无特殊配置）
 */
function OCRConfig() {
  return (
    <div className="text-sm text-muted-foreground">
      <p>OCR 使用 Vision 模型能力，通过图片输入自动识别文字。</p>
      <p className="mt-2">请在用户提示词中引用包含图片的节点输出。</p>
    </div>
  )
}
