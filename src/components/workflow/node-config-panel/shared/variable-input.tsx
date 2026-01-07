'use client'

import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { CompactReferenceSelector } from './compact-reference-selector'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/stores/workflow-store'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  containsVariableRef,
  validateForUI,
  buildAvailableVariablesFromWorkflow,
  getVariableSuggestions,
  formatValidationError,
  type AvailableVariable,
  type ValidationResult,
} from '@/lib/mcp/variable-validation'

interface VariableInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  type?: 'text' | 'url'
  showReference?: boolean
  disabled?: boolean
  /** Whether to show validation status */
  showValidation?: boolean
  /** Whether to show autocomplete suggestions */
  showAutocomplete?: boolean
  /** Callback when validation state changes */
  onValidationChange?: (result: ValidationResult) => void
}

/**
 * 带变量引用支持的单行输入组件
 * 用于工具配置面板中需要支持变量引用的字段
 * 
 * 支持功能:
 * - 变量引用检测和高亮
 * - 变量引用验证（检查变量是否存在于工作流上下文）
 * - 变量自动完成建议
 * 
 * **Validates: Requirements 7.2, 7.3**
 */
export function VariableInput({
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
  showReference = true,
  disabled = false,
  showValidation = true,
  showAutocomplete = true,
  onValidationChange,
}: VariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Get workflow context for validation
  const { nodes, edges, selectedNodeId } = useWorkflowStore()

  // Build available variables from workflow context
  const availableVariables = useMemo(() => {
    if (!selectedNodeId) return []
    return buildAvailableVariablesFromWorkflow(
      nodes.map(n => ({ id: n.id, data: n.data as Record<string, unknown>, parentId: n.parentId })),
      edges.map(e => ({ source: e.source, target: e.target, data: e.data as Record<string, unknown> })),
      selectedNodeId
    )
  }, [nodes, edges, selectedNodeId])

  // Check if value contains variables
  const hasVariables = useMemo(() => {
    return containsVariableRef(value)
  }, [value])

  // Validate variable references
  const validationResult = useMemo(() => {
    if (!hasVariables || !showValidation) {
      return { isValid: true, variables: [], missingVariables: [], errors: [] }
    }
    return validateForUI(value, availableVariables)
  }, [value, hasVariables, availableVariables, showValidation])

  // Notify parent of validation changes
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(validationResult)
    }
  }, [validationResult, onValidationChange])

  // Get partial variable being typed (for autocomplete)
  const partialVariable = useMemo(() => {
    if (!showAutocomplete || !isFocused) return null
    
    // Find if cursor is inside a {{ }} block
    const beforeCursor = value.slice(0, cursorPosition)
    const lastOpenBrace = beforeCursor.lastIndexOf('{{')
    const lastCloseBrace = beforeCursor.lastIndexOf('}}')
    
    if (lastOpenBrace > lastCloseBrace) {
      // We're inside a variable reference
      return beforeCursor.slice(lastOpenBrace + 2)
    }
    return null
  }, [value, cursorPosition, isFocused, showAutocomplete])

  // Get filtered suggestions
  const suggestions = useMemo(() => {
    if (partialVariable === null) return []
    return getVariableSuggestions(partialVariable, availableVariables)
  }, [partialVariable, availableVariables])

  // Handle reference insertion
  const handleInsertReference = useCallback((reference: string) => {
    const input = inputRef.current
    if (!input) {
      onChange(value + reference)
      return
    }

    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length

    const newValue = value.slice(0, start) + reference + value.slice(end)
    onChange(newValue)

    requestAnimationFrame(() => {
      const newCursorPos = start + reference.length
      input.setSelectionRange(newCursorPos, newCursorPos)
      input.focus()
    })
  }, [value, onChange])

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback((variable: AvailableVariable) => {
    const input = inputRef.current
    if (!input) return

    const beforeCursor = value.slice(0, cursorPosition)
    const afterCursor = value.slice(cursorPosition)
    
    // Find the start of the current variable reference
    const lastOpenBrace = beforeCursor.lastIndexOf('{{')
    
    if (lastOpenBrace !== -1) {
      // Replace from {{ to cursor with the full reference
      const newValue = value.slice(0, lastOpenBrace) + variable.reference + afterCursor
      onChange(newValue)
      
      requestAnimationFrame(() => {
        const newCursorPos = lastOpenBrace + variable.reference.length
        input.setSelectionRange(newCursorPos, newCursorPos)
        input.focus()
      })
    }
    
    setShowSuggestions(false)
  }, [value, cursorPosition, onChange])

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setCursorPosition(e.target.selectionStart ?? 0)
    
    // Show suggestions when typing inside {{ }}
    const newValue = e.target.value
    const pos = e.target.selectionStart ?? 0
    const beforeCursor = newValue.slice(0, pos)
    const lastOpenBrace = beforeCursor.lastIndexOf('{{')
    const lastCloseBrace = beforeCursor.lastIndexOf('}}')
    
    if (lastOpenBrace > lastCloseBrace && showAutocomplete) {
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
    }
  }, [onChange, showAutocomplete])

  // Handle key events for autocomplete navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        e.preventDefault()
      }
    }
  }, [showSuggestions, suggestions])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Validation status indicator
  const validationIndicator = useMemo(() => {
    if (!hasVariables || !showValidation) return null
    
    const errorMessage = formatValidationError(validationResult)
    
    if (validationResult.isValid) {
      return (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span className="text-[10px] text-green-500 bg-green-50 dark:bg-green-950 px-1 rounded">
                  变量
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              所有变量引用有效
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span className="text-[10px] text-red-500 bg-red-50 dark:bg-red-950 px-1 rounded">
                无效
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[200px]">
            {errorMessage}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }, [hasVariables, showValidation, validationResult])

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          type={type}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Delay blur to allow clicking suggestions
            setTimeout(() => setIsFocused(false), 200)
          }}
          onKeyDown={handleKeyDown}
          onSelect={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart ?? 0)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'h-8 text-xs pr-16',
            hasVariables && validationResult.isValid && 'text-blue-600 dark:text-blue-400',
            hasVariables && !validationResult.isValid && 'text-red-600 dark:text-red-400 border-red-300'
          )}
        />
        
        {/* Validation indicator */}
        {validationIndicator}
        
        {/* Autocomplete suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg max-h-[200px] min-w-[200px] overflow-y-auto"
          >
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b bg-muted/50">
              可用变量
            </div>
            <div className="py-0.5">
              {suggestions.map((variable) => (
                <button
                  key={variable.path}
                  type="button"
                  className="w-full px-2 py-1.5 text-xs text-left hover:bg-accent transition-colors flex flex-col gap-0.5"
                  onClick={() => handleSelectSuggestion(variable)}
                >
                  <div className="flex items-center gap-1">
                    <span className="font-medium truncate">{variable.name}</span>
                    {variable.nodeName && (
                      <span className="text-[10px] text-muted-foreground">
                        ({variable.nodeName})
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {variable.reference}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {showReference && !disabled && (
        <CompactReferenceSelector onInsert={handleInsertReference} />
      )}
    </div>
  )
}
