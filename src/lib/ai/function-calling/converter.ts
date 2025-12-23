/**
 * 工具定义格式转换器
 * 
 * 将内部工具定义转换为 OpenAI/Claude 格式
 */

import type {
  ToolDefinition,
  ToolParameter,
  OpenAITool,
  ClaudeTool,
  JSONSchema,
  JSONSchemaProperty,
  AIProviderFormat,
  ToolConfig,
} from './types'

/**
 * 将工具参数转换为 JSON Schema 属性
 */
function parameterToSchemaProperty(param: ToolParameter): JSONSchemaProperty {
  const property: JSONSchemaProperty = {
    type: param.type,
    description: param.description,
  }

  if (param.enum) {
    property.enum = param.enum
  }

  if (param.default !== undefined) {
    property.default = param.default
  }

  if (param.type === 'array' && param.items) {
    property.items = {
      type: param.items.type,
    }
    if (param.items.properties) {
      property.items.properties = {}
      for (const [key, nestedParam] of Object.entries(param.items.properties)) {
        property.items.properties[key] = parameterToSchemaProperty(nestedParam)
      }
    }
  }

  if (param.type === 'object' && param.properties) {
    property.properties = {}
    const requiredFields: string[] = []
    for (const [key, nestedParam] of Object.entries(param.properties)) {
      property.properties[key] = parameterToSchemaProperty(nestedParam)
      if (nestedParam.required) {
        requiredFields.push(key)
      }
    }
    if (requiredFields.length > 0) {
      property.required = requiredFields
    }
  }

  return property
}

/**
 * 将工具定义转换为 JSON Schema
 */
function toolDefinitionToSchema(definition: ToolDefinition): JSONSchema {
  const properties: Record<string, JSONSchemaProperty> = {}
  const required: string[] = []

  for (const param of definition.parameters) {
    properties[param.name] = parameterToSchemaProperty(param)
    if (param.required) {
      required.push(param.name)
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  }
}

/**
 * 将工具定义转换为 OpenAI 格式
 */
export function toOpenAIFormat(definition: ToolDefinition): OpenAITool {
  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: toolDefinitionToSchema(definition),
    },
  }
}

/**
 * 将工具定义转换为 Claude 格式
 */
export function toClaudeFormat(definition: ToolDefinition): ClaudeTool {
  return {
    name: definition.name,
    description: definition.description,
    input_schema: toolDefinitionToSchema(definition),
  }
}

/**
 * 批量转换工具定义
 */
export function convertTools(
  definitions: ToolDefinition[],
  format: AIProviderFormat
): OpenAITool[] | ClaudeTool[] {
  switch (format) {
    case 'openai':
    case 'shensuan': // 胜算云使用 OpenAI 兼容格式
      return definitions.map(toOpenAIFormat)
    case 'claude':
      return definitions.map(toClaudeFormat)
    default:
      return definitions.map(toOpenAIFormat)
  }
}

/**
 * 从工具配置创建工具定义
 */
export function toolConfigToDefinition(config: ToolConfig): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    category: config.category,
  }
}

/**
 * 批量从工具配置创建工具定义
 */
export function toolConfigsToDefinitions(configs: ToolConfig[]): ToolDefinition[] {
  return configs.filter(c => c.enabled).map(toolConfigToDefinition)
}

/**
 * 根据提供商类型获取格式
 */
export function getProviderFormat(provider: string): AIProviderFormat {
  const providerLower = provider.toLowerCase()
  
  if (providerLower.includes('anthropic') || providerLower.includes('claude')) {
    return 'claude'
  }
  
  if (providerLower.includes('shensuan')) {
    return 'shensuan'
  }
  
  // 默认使用 OpenAI 格式（大多数提供商兼容）
  return 'openai'
}

/**
 * 验证工具定义是否有效
 */
export function validateToolDefinition(definition: ToolDefinition): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // 验证名称
  if (!definition.name) {
    errors.push('工具名称不能为空')
  } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(definition.name)) {
    errors.push('工具名称只能包含字母、数字和下划线，且不能以数字开头')
  } else if (definition.name.length > 64) {
    errors.push('工具名称长度不能超过 64 个字符')
  }

  // 验证描述
  if (!definition.description) {
    errors.push('工具描述不能为空')
  } else if (definition.description.length > 1024) {
    errors.push('工具描述长度不能超过 1024 个字符')
  }

  // 验证参数
  for (const param of definition.parameters) {
    if (!param.name) {
      errors.push('参数名称不能为空')
    }
    if (!param.type) {
      errors.push(`参数 "${param.name}" 缺少类型定义`)
    }
    if (!param.description) {
      errors.push(`参数 "${param.name}" 缺少描述`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
