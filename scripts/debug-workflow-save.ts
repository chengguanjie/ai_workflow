/**
 * 调试工作流保存问题的脚本
 * 
 * 运行方式: npx tsx scripts/debug-workflow-save.ts
 */

import { workflowUpdateSchema } from '../src/lib/validations/workflow'

// 模拟一个包含旧节点类型的工作流配置
const testConfig = {
  nodes: [
    {
      id: 'input_1',
      name: '用户输入',
      type: 'INPUT',
      position: { x: 100, y: 100 },
      config: {
        fields: [
          { id: 'field_1', name: '配方', value: '', fieldType: 'text' }
        ]
      }
    },
    {
      id: 'process_1',
      name: 'AI处理',
      type: 'PROCESS',
      position: { x: 300, y: 100 },
      config: {
        model: 'deepseek/deepseek-chat',
        userPrompt: '处理 {{用户输入.配方}}'
      }
    },
    // 测试旧节点类型
    {
      id: 'code_1',
      name: '代码节点',
      type: 'CODE',
      position: { x: 500, y: 100 },
      config: {
        code: 'console.log("test")'
      }
    },
    {
      id: 'output_1',
      name: '输出节点',
      type: 'OUTPUT',
      position: { x: 700, y: 100 },
      config: {
        format: 'text'
      }
    }
  ],
  edges: [
    { id: 'edge_1', source: 'input_1', target: 'process_1' },
    { id: 'edge_2', source: 'process_1', target: 'code_1' },
    { id: 'edge_3', source: 'code_1', target: 'output_1' }
  ]
}

const testPayload = {
  name: '测试工作流',
  description: '测试描述',
  config: testConfig
}

console.log('=== 测试工作流保存验证 ===\n')

try {
  const result = workflowUpdateSchema.safeParse(testPayload)
  
  if (result.success) {
    console.log('✅ 验证通过!')
    console.log('\n解析后的节点类型:')
    result.data.config?.nodes.forEach((node: { id: string; type: string; name: string }) => {
      console.log(`  - ${node.name} (${node.id}): ${node.type}`)
    })
  } else {
    console.log('❌ 验证失败!')
    console.log('\n错误详情:')
    result.error.issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. 路径: ${issue.path.join('.')}`)
      console.log(`     消息: ${issue.message}`)
      console.log(`     代码: ${issue.code}`)
    })
  }
} catch (error) {
  console.log('❌ 发生异常!')
  console.error(error)
}
