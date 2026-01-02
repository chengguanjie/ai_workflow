'use client'

import { Label } from '@/components/ui/label'
import { OUTPUT_TYPE_LABELS, type OutputType } from '@/lib/workflow/debug-panel/types'

interface OutputTypeSelectorProps {
  selectedType: OutputType
  onTypeChange: (type: OutputType) => void
  disabled?: boolean
  className?: string
}

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

export function OutputTypeSelector({
  selectedType,
  onTypeChange,
  disabled = false,
  className
}: OutputTypeSelectorProps) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground mb-2 block">
        输出类型
      </Label>
      <select
        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={selectedType}
        onChange={(e) => onTypeChange(e.target.value as OutputType)}
        disabled={disabled}
      >
        {ALL_OUTPUT_TYPES.map((type) => (
          <option key={type} value={type}>
            {OUTPUT_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
    </div>
  )
}

export default OutputTypeSelector
