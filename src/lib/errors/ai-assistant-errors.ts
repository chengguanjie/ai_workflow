
/**
 * AI Assistant Specific Errors
 * Provides a unified way to handle errors in the AI Assistant module.
 */

export enum AIAssistantErrorCode {
                  PROVIDER_CONFIG_MISSING = 'PROVIDER_CONFIG_MISSING',
                  INVALID_REQUEST = 'INVALID_REQUEST',
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
                                                      case AIAssistantErrorCode.INVALID_REQUEST:
                                                                        return 'AI 请求参数有误（可能是模型名、Base URL 或参数不兼容），请检查 AI 配置后重试。';
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

                                    const message = String(error?.message || '')
                                    const lower = message.toLowerCase()

                                    // Provider-side quota/balance errors (some gateways return 403 for these)
                                    if (
                                                      message.includes('用户余额不足') ||
                                                      message.includes('余额不足') ||
                                                      lower.includes('insufficient balance') ||
                                                      lower.includes('quota') ||
                                                      lower.includes('billing')
                                    ) {
                                                      throw new AIAssistantError(
                                                                        AIAssistantErrorCode.MODEL_QUOTA_EXCEEDED,
                                                                        message,
                                                                        'AI 服务余额/额度不足，请充值或更换可用的 API Key。',
                                                                        false
                                                      )
                                    }

                                    // Local decrypt/config errors
                                    if (
                                                      message.includes('无法解密 API Key') ||
                                                      message.includes('ENCRYPTION_KEY') ||
                                                      message.includes('ENCRYPTION_SALT')
                                    ) {
                                                      throw new AIAssistantError(
                                                                        AIAssistantErrorCode.API_KEY_INVALID,
                                                                        message,
                                                                        'AI 服务配置无法解密，请在设置中重新输入并保存 API Key。',
                                                                        false
                                                      )
                                    }

                                    // Model/configuration errors (present a helpful message directly)
                                    if (message.includes('【模型配置错误】')) {
                                                      throw new AIAssistantError(
                                                                        AIAssistantErrorCode.INVALID_REQUEST,
                                                                        message,
                                                                        message,
                                                                        false
                                                      )
                                    }

                                    // Context length errors from common providers
                                    if (
                                                      lower.includes('context_length_exceeded') ||
                                                      lower.includes('maximum context length') ||
                                                      lower.includes('too many tokens') ||
                                                      lower.includes('context window')
                                    ) {
                                                      throw new AIAssistantError(
                                                                        AIAssistantErrorCode.CONTEXT_TOO_LONG,
                                                                        message
                                                      )
                                    }

                                    // Map common errors to AIAssistantError
                                    if (message.includes('401') || lower.includes('unauthorized')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.API_KEY_INVALID, message);
                                    }
                                    if (message.includes('403') || lower.includes('forbidden')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.API_KEY_INVALID, message, 'API Key 权限不足或已被禁用，请检查配置。');
                                    }
                                    if (message.includes('429') || lower.includes('rate limit')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.MODEL_QUOTA_EXCEEDED, message, undefined, true);
                                    }
                                    if (lower.includes('timeout') || lower.includes('timed out')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.GENERATION_TIMEOUT, message, undefined, true);
                                    }
                                    if (error?.name === 'SyntaxError') {
                                                      throw new AIAssistantError(AIAssistantErrorCode.INVALID_JSON_RESPONSE, message, undefined, true);
                                    }

                                    // 4xx invalid request parameters (model name, max_tokens, baseUrl, etc.)
                                    if (message.includes('400') || lower.includes('bad request')) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.INVALID_REQUEST, message);
                                    }

                                    // Network-ish / provider availability issues
                                    if (
                                                      lower.includes('fetch failed') ||
                                                      lower.includes('network') ||
                                                      lower.includes('econn') ||
                                                      message.includes('502') ||
                                                      message.includes('503') ||
                                                      message.includes('504')
                                    ) {
                                                      throw new AIAssistantError(AIAssistantErrorCode.NETWORK_ERROR, message, undefined, true);
                                    }

                                    throw new AIAssistantError(AIAssistantErrorCode.UNKNOWN_ERROR, message || 'Unknown error');
                  }
}
