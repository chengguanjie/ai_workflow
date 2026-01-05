
/**
 * AI Assistant Specific Errors
 * Provides a unified way to handle errors in the AI Assistant module.
 */

export enum AIAssistantErrorCode {
                  PROVIDER_CONFIG_MISSING = 'PROVIDER_CONFIG_MISSING',
                  API_KEY_INVALID = 'API_KEY_INVALID',
                  MODEL_QUOTA_EXCEEDED = 'MODEL_QUOTA_EXCEEDED',
                  CONTEXT_TOO_LONG = 'CONTEXT_TOO_LONG',
                  GENERATION_TIMEOUT = 'GENERATION_TIMEOUT',
                  INVALID_JSON_RESPONSE = 'INVALID_JSON_RESPONSE',
                  NETWORK_ERROR = 'NETWORK_ERROR',
                  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class AIAssistantError extends Error {
                  code: AIAssistantErrorCode;
                  retryable: boolean;
                  userMessage: string;

                  constructor(
                                    code: AIAssistantErrorCode,
                                    message: string,
                                    userMessage?: string,
                                    retryable: boolean = false
                  ) {
                                    super(message);
                                    this.name = 'AIAssistantError';
                                    this.code = code;
                                    this.userMessage = userMessage || this.getDefaultUserMessage(code);
                                    this.retryable = retryable;
                  }

                  private getDefaultUserMessage(code: AIAssistantErrorCode): string {
                                    switch (code) {
                                                      case AIAssistantErrorCode.PROVIDER_CONFIG_MISSING:
                                                                        return '未配置 AI 服务商，请联系管理员配置。';
                                                      case AIAssistantErrorCode.API_KEY_INVALID:
                                                                        return 'AI 服务配置无效或 API Key 已过期。';
                                                      case AIAssistantErrorCode.MODEL_QUOTA_EXCEEDED:
                                                                        return 'AI 服务额度已耗尽，请稍后再试。';
                                                      case AIAssistantErrorCode.CONTEXT_TOO_LONG:
                                                                        return '工作流内容过长，超出模型处理限制。请尝试简化或分段处理。';
                                                      case AIAssistantErrorCode.GENERATION_TIMEOUT:
                                                                        return 'AI 响应超时，请重试。';
                                                      case AIAssistantErrorCode.INVALID_JSON_RESPONSE:
                                                                        return 'AI 返回了无效的数据格式，建议重试。';
                                                      case AIAssistantErrorCode.NETWORK_ERROR:
                                                                        return '网络连接异常，请检查网络设置。';
                                                      default:
                                                                        return 'AI 助手遇到未知错误，请稍后重试。';
                                    }
                  }
}

/**
 * Helper to wrap AI service calls with unified error handling
 */
export async function withAIErrorHandling<T>(
                  operation: () => Promise<T>,
                  context: string = 'AI Operation'
): Promise<T> {
                  try {
                                    return await operation();
                  } catch (error: any) {
                                    console.error(`Error in ${context}:`, error);

                                    // Map common errors to AIAssistantError
                                    if (error.message?.includes('401')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.API_KEY_INVALID, error.message);
                                    }
                                    if (error.message?.includes('403')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.API_KEY_INVALID, error.message, 'API Key 权限不足或已被禁用，请检查配置。');
                                    }
                                    if (error.message?.includes('429')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.MODEL_QUOTA_EXCEEDED, error.message, undefined, true);
                                    }
                                    if (error.message?.includes('timeout')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.GENERATION_TIMEOUT, error.message, undefined, true);
                                    }
                                    if (error.name === 'SyntaxError' && context.includes('JSON')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.INVALID_JSON_RESPONSE, error.message, undefined, true);
                                    }

                                    throw new AIAssistantError(AIAssistantErrorCode.UNKNOWN_ERROR, error.message || 'Unknown error');
                  }
}
