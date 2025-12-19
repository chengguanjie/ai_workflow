// AI 服务商配置类型
export interface AIProviderConfig {
  id: string
  name: string
  provider: string
  baseUrl: string
  defaultModel: string
  models: string[]
  isDefault: boolean
  displayName: string
}

// 节点引用选项类型
export interface NodeReferenceOption {
  nodeId: string
  nodeName: string
  nodeType: string
  // 可引用的字段列表
  fields: {
    id: string
    name: string
    type: 'field' | 'knowledge' | 'output'  // 字段类型：输入字段、知识库、节点输出
    reference: string  // 完整的引用语法
  }[]
}
