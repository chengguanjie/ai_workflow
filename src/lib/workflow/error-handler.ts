/**
 * 工作流错误处理器
 *
 * 负责分析执行错误，提供友好的错误提示和修复建议
 */

export interface ErrorAnalysis {
        message: string            // 原始错误信息
        friendlyMessage: string    // 友好提示
        suggestions: string[]      // 修复建议
        code?: string             // 错误代码
        isRetryable: boolean      // 是否可重试
}

export class WorkflowErrorHandler {
        /**
         * 分析错误并生成报告
         */
        static analyzeError(error: unknown, nodeType?: string): ErrorAnalysis {
                const rawMessage = error instanceof Error ? error.message : String(error)
                let analysis: ErrorAnalysis = {
                        message: rawMessage,
                        friendlyMessage: '执行过程中发生未知错误',
                        suggestions: ['请检查节点配置', '查看详细日志以获取更多信息'],
                        isRetryable: false,
                }

                // 1. LLM 相关错误
                if (this.isLLMError(rawMessage)) {
                        analysis = this.analyzeLLMError(rawMessage)
                }
                // 2. 代码执行错误
                else if (nodeType === 'CODE' || this.isCodeError(rawMessage)) {
                        analysis = this.analyzeCodeError(rawMessage)
                }
                // 3. 网络请求错误
                else if (this.isNetworkError(rawMessage)) {
                        analysis = this.analyzeNetworkError(rawMessage)
                }
                // 4. 数据库/Prisma 错误
                else if (this.isDatabaseError(rawMessage)) {
                        analysis = this.analyzeDatabaseError(rawMessage)
                }

                return analysis
        }

        private static isLLMError(msg: string): boolean {
                const keywords = ['openai', 'anthropic', 'api key', 'rate limit', 'quota', 'context length', 'max tokens', 'insufficient_quota']
                return keywords.some(k => msg.toLowerCase().includes(k))
        }

        private static analyzeLLMError(msg: string): ErrorAnalysis {
                const lowerMsg = msg.toLowerCase()
                const result: ErrorAnalysis = {
                        message: msg,
                        friendlyMessage: 'AI 服务调用失败',
                        suggestions: [],
                        isRetryable: true,
                }

                if (lowerMsg.includes('api key') || lowerMsg.includes('auth') || lowerMsg.includes('credentials')) {
                        result.friendlyMessage = 'AI 服务认证失败'
                        result.suggestions = ['请检查 API Key 配置是否正确', '确认 Key 是否过期或被禁用']
                        result.isRetryable = false
                        result.code = 'AUTH_ERROR'
                } else if (lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests') || lowerMsg.includes('429')) {
                        result.friendlyMessage = 'AI 服务请求过于频繁'
                        result.suggestions = ['请稍后重试', '考虑降低并发数', '检查服务商的速率限制']
                        result.code = 'RATE_LIMIT'
                } else if (lowerMsg.includes('quota') || lowerMsg.includes('insufficient')) {
                        result.friendlyMessage = 'AI 服务额度不足'
                        result.suggestions = ['请检查账户余额', '升级服务套餐']
                        result.isRetryable = false
                        result.code = 'QUOTA_EXCEEDED'
                } else if (lowerMsg.includes('context length') || lowerMsg.includes('max tokens')) {
                        result.friendlyMessage = '输入内容超过模型限制'
                        result.suggestions = ['减少输入文本长度', '更换支持更大上下文的模型 (如 GPT-4-32k, Claude-3-200k)']
                        result.isRetryable = false
                        result.code = 'CONTEXT_LIMIT'
                } else if (lowerMsg.includes('timeout')) {
                        result.friendlyMessage = 'AI 服务响应超时'
                        result.suggestions = ['检查网络连接', '增加超时时间配置']
                        result.code = 'TIMEOUT'
                }

                return result
        }

        private static isCodeError(msg: string): boolean {
                // 简单的代码错误关键词
                const keywords = ['syntax error', 'referenceerror', 'typeerror', 'runtime error', 'is not defined']
                return keywords.some(k => msg.toLowerCase().includes(k))
        }

        private static analyzeCodeError(msg: string): ErrorAnalysis {
                const result: ErrorAnalysis = {
                        message: msg,
                        friendlyMessage: '代码执行出错',
                        suggestions: ['检查代码语法', '确保使用了正确的变量名', '查看控制台日志了解详情'],
                        isRetryable: false,
                        code: 'CODE_EXECUTION_ERROR',
                }

                if (msg.includes('ReferenceError') || msg.includes('is not defined')) {
                        result.friendlyMessage = '代码引用了不存在的变量'
                        result.suggestions.unshift('检查是否拼写错误变量名')
                } else if (msg.includes('SyntaxError')) {
                        result.friendlyMessage = '代码语法错误'
                } else if (msg.includes('TypeError')) {
                        result.friendlyMessage = '类型错误'
                        result.suggestions.unshift('检查变量类型是否符合预期')
                } else if (msg.includes('timeout') || msg.includes('timed out')) {
                        result.friendlyMessage = '代码执行超时'
                        result.suggestions = ['优化代码逻辑，避免死循环', '减少处理的数据量', '增加超时时间设置']
                        result.isRetryable = true // 可能是临时的
                        result.code = 'CODE_TIMEOUT'
                }

                return result
        }

        private static isNetworkError(msg: string): boolean {
                const keywords = ['fetch', 'network', 'econnrefused', 'etimedout', 'dns', 'unreachable']
                return keywords.some(k => msg.toLowerCase().includes(k))
        }

        private static analyzeNetworkError(msg: string): ErrorAnalysis {
                return {
                        message: msg,
                        friendlyMessage: '网络请求失败',
                        suggestions: ['检查目标服务是否正常运行', '检查网络连通性', '确认防火墙配置'],
                        isRetryable: true,
                        code: 'NETWORK_ERROR',
                }
        }

        private static isDatabaseError(msg: string): boolean {
                const keywords = ['prisma', 'database', 'connection', 'query', 'unique constraint']
                return keywords.some(k => msg.toLowerCase().includes(k))
        }

        private static analyzeDatabaseError(msg: string): ErrorAnalysis {
                const result: ErrorAnalysis = {
                        message: msg,
                        friendlyMessage: '数据库操作失败',
                        suggestions: ['请联系管理员'],
                        isRetryable: true,
                        code: 'DB_ERROR',
                }

                if (msg.includes('Unique constraint')) {
                        result.friendlyMessage = '数据重复冲突'
                        result.suggestions = ['检查是否重复提交数据', '确保唯一标识符不重复']
                        result.isRetryable = false
                        result.code = 'DB_UNIQUE_VIOLATION'
                } else if (msg.includes('Foreign key')) {
                        result.friendlyMessage = '数据关联错误'
                        result.suggestions = ['关联的数据不存在', '请刷新页面重试']
                        result.isRetryable = false
                }

                return result
        }
}
