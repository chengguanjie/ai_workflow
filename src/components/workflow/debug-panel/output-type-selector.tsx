'use client'

import React from 'react'
import {
  FileText,
  FileJson,
  Code,
  Table,
  FileType,
  Image,
  Music,
  Video
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { OUTPUT_TYPE_LABELS, type OutputType } from '@/lib/workflow/debug-panel/types'

// ============================================
// Types
// ============================================

interface OutputTypeSelectorProps {
  selectedType: OutputType
  onTypeChange: (type: OutputType) => void
  disabled?: boolean
  className?: string
}

// ============================================
// Constants
// ============================================

/**
 * All supported output types in display order
 */
const ALL_OUTPUT_TYPES: OutputType[] = [
  'text',
  'json',
  'html',
  'csv',
  'word',
  'pdf',
  'excel',
  'ppt',
  'image',
  'audio',
  'video'
]

/**
 * Icon mapping for each output type
 */
const OUTPUT_TYPE_ICONS: Record<OutputType, React.ComponentType<{ className?: string }>> = {
  'text': FileText,
  'json': FileJson,
  'html': Code,
  'csv': Table,
  'word': FileType,
  'pdf': FileType,
  'excel': Table,
  'ppt': FileType,
  'image': Image,
  'audio': Music,
  'video': Video
}

// ============================================
// OutputTypeSelector Component
// ============================================

/**
 * OutputTypeSelector - A component for selecting output type/format
 * 
 * Supports 11 output types:
 * - text: 纯文本
 * - json: JSON
 * - html: HTML
 * - csv: CSV
 * - word: Word文档
 * - pdf: PDF文档
 * - excel: Excel表格
 * - ppt: PPT演示
 * - image: 图片
 * - audio: 音频
 * - video: 视频
 */
export function OutputTypeSelector({
  selectedType,
  onTypeChange,
  disabled = false,
  className
}: OutputTypeSelectorProps) {
  // Get icon component for an output type
  const getIcon = (type: OutputType) => {
    const IconComponent = OUTPUT_TYPE_ICONS[type]
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null
  }

  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">
        输出类型
      </Label>
      <Select
        value={selectedType}
        onValueChange={(value: string) => onTypeChange(value as OutputType)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-9">
          <SelectValue placeholder="选择输出类型">
            <div className="flex items-center gap-2">
              {getIcon(selectedType)}
              <span>{OUTPUT_TYPE_LABELS[selectedType]}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ALL_OUTPUT_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              <div className="flex items-center gap-2">
                {getIcon(type)}
                <span>{OUTPUT_TYPE_LABELS[type]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default OutputTypeSelector
