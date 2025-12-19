'use client'

import { FileSpreadsheet, ImageIcon, VideoIcon, MusicIcon } from 'lucide-react'
import { MediaNodeConfigPanel } from './media-node-config'

interface DataNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function DataNodeConfigPanel({
  config,
  onUpdate,
}: DataNodeConfigPanelProps) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="data"
      title="数据文件"
      acceptFormats=".xlsx,.xls,.csv"
      formatDescription="Excel (.xlsx, .xls), CSV (.csv)"
      icon={<FileSpreadsheet className="h-8 w-8 text-cyan-500" />}
    />
  )
}

interface ImageNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function ImageNodeConfigPanel({
  config,
  onUpdate,
}: ImageNodeConfigPanelProps) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="image"
      title="图片"
      acceptFormats=".jpg,.jpeg,.png,.gif,.webp,.svg,.bmp"
      formatDescription="JPG, PNG, GIF, WebP, SVG, BMP"
      icon={<ImageIcon className="h-8 w-8 text-pink-500" />}
    />
  )
}

interface VideoNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function VideoNodeConfigPanel({
  config,
  onUpdate,
}: VideoNodeConfigPanelProps) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="video"
      title="视频/图片"
      acceptFormats=".mp4,.mov,.avi,.webm,.mkv,.jpg,.jpeg,.png,.gif"
      formatDescription="MP4, MOV, AVI, WebM, MKV, 或图片格式"
      icon={<VideoIcon className="h-8 w-8 text-red-500" />}
    />
  )
}

interface AudioNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

export function AudioNodeConfigPanel({
  config,
  onUpdate,
}: AudioNodeConfigPanelProps) {
  return (
    <MediaNodeConfigPanel
      config={config}
      onUpdate={onUpdate}
      nodeType="audio"
      title="音频"
      acceptFormats=".mp3,.wav,.ogg,.flac,.aac,.m4a"
      formatDescription="MP3, WAV, OGG, FLAC, AAC, M4A"
      icon={<MusicIcon className="h-8 w-8 text-amber-500" />}
    />
  )
}
