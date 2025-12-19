'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface GroupNodeConfigPanelProps {
  config?: Record<string, unknown>
  onUpdate: (config: Record<string, unknown>) => void
}

// 预定义的颜色选项
const colorOptions = [
  { name: '灰色', value: 'gray', bgClass: 'bg-gray-100', borderClass: 'border-gray-300' },
  { name: '蓝色', value: 'blue', bgClass: 'bg-blue-50', borderClass: 'border-blue-300' },
  { name: '绿色', value: 'green', bgClass: 'bg-green-50', borderClass: 'border-green-300' },
  { name: '黄色', value: 'yellow', bgClass: 'bg-yellow-50', borderClass: 'border-yellow-300' },
  { name: '红色', value: 'red', bgClass: 'bg-red-50', borderClass: 'border-red-300' },
  { name: '紫色', value: 'purple', bgClass: 'bg-purple-50', borderClass: 'border-purple-300' },
  { name: '粉色', value: 'pink', bgClass: 'bg-pink-50', borderClass: 'border-pink-300' },
  { name: '青色', value: 'cyan', bgClass: 'bg-cyan-50', borderClass: 'border-cyan-300' },
]

export function GroupNodeConfigPanel({ config, onUpdate }: GroupNodeConfigPanelProps) {
  const currentColor = (config?.color as string) || 'gray'

  const handleColorChange = (color: string) => {
    onUpdate({
      ...config,
      color,
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>底纹颜色</Label>
        <div className="grid grid-cols-4 gap-2">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              className={cn(
                'w-full aspect-square rounded-md border-2 transition-all',
                option.bgClass,
                currentColor === option.value
                  ? 'ring-2 ring-primary ring-offset-2 border-primary'
                  : option.borderClass + ' hover:scale-105'
              )}
              onClick={() => handleColorChange(option.value)}
              title={option.name}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          当前: {colorOptions.find(c => c.value === currentColor)?.name || '灰色'}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">组内节点</Label>
        <p className="text-sm">
          {((config?.childNodeIds as string[]) || []).length} 个节点
        </p>
      </div>
    </div>
  )
}
