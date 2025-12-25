/**
 * 工具名称映射器
 * 
 * 将 UI 层的工具类型名称映射到后端执行器名称
 */

/**
 * UI 工具类型到后端执行器名称的映射
 */
const TOOL_NAME_MAP: Record<string, string> = {
  'http-request': 'http_request',
  'notification-feishu': 'send_notification',
  'notification-dingtalk': 'send_notification',
  'notification-wecom': 'send_notification',
  'feishu-bitable': 'feishu_bitable',
  'xiaohongshu': 'xiaohongshu',
  'douyin-video': 'douyin_video',
  'wechat-mp': 'wechat_mp',
  'claude-skill': 'claude_skill',
  'custom': 'custom',
}

/**
 * 反向映射：后端执行器名称到 UI 工具类型
 */
const REVERSE_TOOL_NAME_MAP: Record<string, string> = {
  'http_request': 'http-request',
  'send_notification': 'notification-feishu',
  'feishu_bitable': 'feishu-bitable',
  'xiaohongshu': 'xiaohongshu',
  'douyin_video': 'douyin-video',
  'wechat_mp': 'wechat-mp',
  'claude_skill': 'claude-skill',
  'custom': 'custom',
}

/**
 * 将 UI 工具类型转换为后端执行器名称
 */
export function mapUIToolToExecutor(uiToolType: string): string {
  return TOOL_NAME_MAP[uiToolType] || uiToolType.replace(/-/g, '_')
}

/**
 * 将后端执行器名称转换为 UI 工具类型
 */
export function mapExecutorToUITool(executorName: string): string {
  return REVERSE_TOOL_NAME_MAP[executorName] || executorName.replace(/_/g, '-')
}

/**
 * 获取通知工具对应的平台类型
 */
export function getNotificationPlatform(uiToolType: string): 'feishu' | 'dingtalk' | 'wecom' | null {
  switch (uiToolType) {
    case 'notification-feishu':
      return 'feishu'
    case 'notification-dingtalk':
      return 'dingtalk'
    case 'notification-wecom':
      return 'wecom'
    default:
      return null
  }
}

/**
 * 检查工具类型是否为通知类型
 */
export function isNotificationTool(uiToolType: string): boolean {
  return uiToolType.startsWith('notification-')
}

/**
 * 检查工具类型是否已实现
 */
export function isToolImplemented(uiToolType: string): boolean {
  const implementedTools = [
    'http-request',
    'notification-feishu',
    'notification-dingtalk',
    'notification-wecom',
  ]
  return implementedTools.includes(uiToolType)
}

/**
 * 获取未实现工具的友好提示
 */
export function getUnimplementedToolMessage(uiToolType: string): string {
  const toolLabels: Record<string, string> = {
    'feishu-bitable': '飞书多维表格',
    'xiaohongshu': '小红书',
    'douyin-video': '抖音视频',
    'wechat-mp': '微信公众号',
    'claude-skill': 'Claude Skill',
    'custom': '自定义工具',
  }
  const label = toolLabels[uiToolType] || uiToolType
  return `工具 "${label}" 尚未实现，敬请期待`
}
