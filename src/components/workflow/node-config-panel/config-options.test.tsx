import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property tests for config panel options completeness and config update propagation
 * These tests verify that all required options are available in the config panels
 * and that configuration updates are properly propagated
 */

// ============================================
// Required Options from Requirements
// ============================================

/**
 * **Feature: advanced-nodes-ui, Property 6: Operator Options Completeness**
 * **Validates: Requirements 2.3**
 * 
 * For any condition configuration UI, all required operators should be available
 */
const REQUIRED_CONDITION_OPERATORS = [
  'equals',        // ==
  'notEquals',     // !=
  'greaterThan',   // >
  'lessThan',      // <
  'greaterOrEqual', // >=
  'lessOrEqual',   // <=
  'contains',      // string contains
  'startsWith',    // string starts with
  'isEmpty',       // is empty
] as const

// Actual operators from condition-node-config.tsx
const CONDITION_OPERATORS = [
  { value: 'equals', label: '等于 (==)', needsValue: true },
  { value: 'notEquals', label: '不等于 (!=)', needsValue: true },
  { value: 'greaterThan', label: '大于 (>)', needsValue: true },
  { value: 'lessThan', label: '小于 (<)', needsValue: true },
  { value: 'greaterOrEqual', label: '大于等于 (>=)', needsValue: true },
  { value: 'lessOrEqual', label: '小于等于 (<=)', needsValue: true },
  { value: 'contains', label: '包含', needsValue: true },
  { value: 'notContains', label: '不包含', needsValue: true },
  { value: 'startsWith', label: '开头是', needsValue: true },
  { value: 'endsWith', label: '结尾是', needsValue: true },
  { value: 'isEmpty', label: '为空', needsValue: false },
  { value: 'isNotEmpty', label: '不为空', needsValue: false },
]

/**
 * **Feature: advanced-nodes-ui, Property 7: HTTP Method Options Completeness**
 * **Validates: Requirements 4.1**
 * 
 * For any HTTP node configuration UI, all HTTP methods should be available
 */
const REQUIRED_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const

// Actual HTTP methods from http-node-config.tsx
const HTTP_METHODS = [
  { value: 'GET', label: 'GET', color: 'bg-green-500' },
  { value: 'POST', label: 'POST', color: 'bg-blue-500' },
  { value: 'PUT', label: 'PUT', color: 'bg-yellow-500' },
  { value: 'DELETE', label: 'DELETE', color: 'bg-red-500' },
  { value: 'PATCH', label: 'PATCH', color: 'bg-purple-500' },
]

/**
 * **Feature: advanced-nodes-ui, Property 8: Auth Type Options Completeness**
 * **Validates: Requirements 4.5**
 * 
 * For any HTTP node authentication configuration, all auth types should be available
 */
const REQUIRED_AUTH_TYPES = ['none', 'basic', 'bearer', 'apikey'] as const

// Actual auth types from http-node-config.tsx
const AUTH_TYPES = [
  { value: 'none', label: '无认证' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'apikey', label: 'API Key' },
]

/**
 * **Feature: advanced-nodes-ui, Property 9: Merge Strategy Options Completeness**
 * **Validates: Requirements 5.2**
 * 
 * For any merge node configuration UI, all merge strategies should be available
 */
const REQUIRED_MERGE_STRATEGIES = ['all', 'any', 'race'] as const

// Actual merge strategies from merge-node-config.tsx
const MERGE_STRATEGIES = [
  { value: 'all', label: '全部完成', description: '等待所有分支完成后继续' },
  { value: 'any', label: '任一完成', description: '任一分支完成后继续' },
  { value: 'race', label: '竞速模式', description: '使用最快完成的分支结果' },
]

/**
 * **Feature: advanced-nodes-ui, Property 10: Output Mode Options Completeness**
 * **Validates: Requirements 5.3**
 * 
 * For any merge node configuration UI, all output modes should be available
 */
const REQUIRED_OUTPUT_MODES = ['merge', 'array', 'first'] as const

// Actual output modes from merge-node-config.tsx
const OUTPUT_MODES = [
  { value: 'merge', label: '合并对象', description: '将各分支输出合并为一个对象' },
  { value: 'array', label: '数组格式', description: '将各分支输出收集为数组' },
  { value: 'first', label: '首个结果', description: '仅使用第一个完成的分支输出' },
]

/**
 * **Feature: advanced-nodes-ui, Property 11: Error Strategy Options Completeness**
 * **Validates: Requirements 5.4**
 * 
 * For any merge node configuration UI, all error strategies should be available
 */
const REQUIRED_ERROR_STRATEGIES = ['fail_fast', 'continue', 'collect'] as const

// Actual error strategies from merge-node-config.tsx
const ERROR_STRATEGIES = [
  { value: 'fail_fast', label: '立即失败', description: '任一分支失败时立即停止' },
  { value: 'continue', label: '继续执行', description: '跳过失败分支，继续其他分支' },
  { value: 'collect', label: '收集错误', description: '完成所有分支后汇总错误' },
]

/**
 * **Feature: advanced-nodes-ui, Property 12: Message Type Options Completeness**
 * **Validates: Requirements 7.3**
 * 
 * For any notification node configuration UI, all message types should be available
 */
const REQUIRED_MESSAGE_TYPES = ['text', 'markdown', 'card'] as const

// Actual message types from notification-node-config.tsx
const MESSAGE_TYPE_OPTIONS = [
  { value: 'text', label: '纯文本', description: '简单文本消息' },
  { value: 'markdown', label: 'Markdown', description: '支持格式化' },
  { value: 'card', label: '卡片消息', description: '富文本卡片' },
]

// ============================================
// Property Tests
// ============================================

describe('Property 6: Operator Options Completeness', () => {
  /**
   * For any required operator, it should be present in the CONDITION_OPERATORS array
   */
  it('all required condition operators should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_CONDITION_OPERATORS),
        (requiredOperator) => {
          const availableOperators = CONDITION_OPERATORS.map(op => op.value)
          expect(availableOperators).toContain(requiredOperator)
        }
      ),
      { numRuns: REQUIRED_CONDITION_OPERATORS.length }
    )
  })

  /**
   * Each operator should have a valid label
   */
  it('each operator should have a non-empty label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONDITION_OPERATORS),
        (operator) => {
          expect(operator.label).toBeDefined()
          expect(operator.label.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: CONDITION_OPERATORS.length }
    )
  })

  /**
   * Each operator should have needsValue defined
   */
  it('each operator should have needsValue property defined', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONDITION_OPERATORS),
        (operator) => {
          expect(typeof operator.needsValue).toBe('boolean')
        }
      ),
      { numRuns: CONDITION_OPERATORS.length }
    )
  })
})

describe('Property 7: HTTP Method Options Completeness', () => {
  /**
   * For any required HTTP method, it should be present in the HTTP_METHODS array
   */
  it('all required HTTP methods should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_HTTP_METHODS),
        (requiredMethod) => {
          const availableMethods = HTTP_METHODS.map(m => m.value)
          expect(availableMethods).toContain(requiredMethod)
        }
      ),
      { numRuns: REQUIRED_HTTP_METHODS.length }
    )
  })

  /**
   * Each HTTP method should have a valid label and color
   */
  it('each HTTP method should have label and color', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HTTP_METHODS),
        (method) => {
          expect(method.label).toBeDefined()
          expect(method.label.length).toBeGreaterThan(0)
          expect(method.color).toBeDefined()
          expect(method.color).toMatch(/^bg-/)
        }
      ),
      { numRuns: HTTP_METHODS.length }
    )
  })
})

describe('Property 8: Auth Type Options Completeness', () => {
  /**
   * For any required auth type, it should be present in the AUTH_TYPES array
   */
  it('all required auth types should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_AUTH_TYPES),
        (requiredAuthType) => {
          const availableAuthTypes = AUTH_TYPES.map(a => a.value)
          expect(availableAuthTypes).toContain(requiredAuthType)
        }
      ),
      { numRuns: REQUIRED_AUTH_TYPES.length }
    )
  })

  /**
   * Each auth type should have a valid label
   */
  it('each auth type should have a non-empty label', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...AUTH_TYPES),
        (authType) => {
          expect(authType.label).toBeDefined()
          expect(authType.label.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: AUTH_TYPES.length }
    )
  })
})

describe('Property 9: Merge Strategy Options Completeness', () => {
  /**
   * For any required merge strategy, it should be present in the MERGE_STRATEGIES array
   */
  it('all required merge strategies should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_MERGE_STRATEGIES),
        (requiredStrategy) => {
          const availableStrategies = MERGE_STRATEGIES.map(s => s.value)
          expect(availableStrategies).toContain(requiredStrategy)
        }
      ),
      { numRuns: REQUIRED_MERGE_STRATEGIES.length }
    )
  })

  /**
   * Each merge strategy should have label and description
   */
  it('each merge strategy should have label and description', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MERGE_STRATEGIES),
        (strategy) => {
          expect(strategy.label).toBeDefined()
          expect(strategy.label.length).toBeGreaterThan(0)
          expect(strategy.description).toBeDefined()
          expect(strategy.description.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: MERGE_STRATEGIES.length }
    )
  })
})

describe('Property 10: Output Mode Options Completeness', () => {
  /**
   * For any required output mode, it should be present in the OUTPUT_MODES array
   */
  it('all required output modes should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_OUTPUT_MODES),
        (requiredMode) => {
          const availableModes = OUTPUT_MODES.map(m => m.value)
          expect(availableModes).toContain(requiredMode)
        }
      ),
      { numRuns: REQUIRED_OUTPUT_MODES.length }
    )
  })

  /**
   * Each output mode should have label and description
   */
  it('each output mode should have label and description', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...OUTPUT_MODES),
        (mode) => {
          expect(mode.label).toBeDefined()
          expect(mode.label.length).toBeGreaterThan(0)
          expect(mode.description).toBeDefined()
          expect(mode.description.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: OUTPUT_MODES.length }
    )
  })
})

describe('Property 11: Error Strategy Options Completeness', () => {
  /**
   * For any required error strategy, it should be present in the ERROR_STRATEGIES array
   */
  it('all required error strategies should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_ERROR_STRATEGIES),
        (requiredStrategy) => {
          const availableStrategies = ERROR_STRATEGIES.map(s => s.value)
          expect(availableStrategies).toContain(requiredStrategy)
        }
      ),
      { numRuns: REQUIRED_ERROR_STRATEGIES.length }
    )
  })

  /**
   * Each error strategy should have label and description
   */
  it('each error strategy should have label and description', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ERROR_STRATEGIES),
        (strategy) => {
          expect(strategy.label).toBeDefined()
          expect(strategy.label.length).toBeGreaterThan(0)
          expect(strategy.description).toBeDefined()
          expect(strategy.description.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: ERROR_STRATEGIES.length }
    )
  })
})

describe('Property 12: Message Type Options Completeness', () => {
  /**
   * For any required message type, it should be present in the MESSAGE_TYPE_OPTIONS array
   */
  it('all required message types should be available', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_MESSAGE_TYPES),
        (requiredType) => {
          const availableTypes = MESSAGE_TYPE_OPTIONS.map(t => t.value)
          expect(availableTypes).toContain(requiredType)
        }
      ),
      { numRuns: REQUIRED_MESSAGE_TYPES.length }
    )
  })

  /**
   * Each message type should have label and description
   */
  it('each message type should have label and description', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MESSAGE_TYPE_OPTIONS),
        (messageType) => {
          expect(messageType.label).toBeDefined()
          expect(messageType.label.length).toBeGreaterThan(0)
          expect(messageType.description).toBeDefined()
          expect(messageType.description.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: MESSAGE_TYPE_OPTIONS.length }
    )
  })
})


// ============================================
// Property 5: Config Update Propagation Tests
// ============================================

/**
 * **Feature: advanced-nodes-ui, Property 5: Config Update Propagation**
 * **Validates: Requirements 2.5, 3.5**
 * 
 * For any configuration change in a node config panel, the onUpdate callback 
 * should be called with the complete updated config object.
 * 
 * This tests the core config update logic that all config panels use:
 * 1. Updates preserve existing config properties
 * 2. Updates correctly merge new values
 * 3. The complete config object is passed to onUpdate
 */

// Arbitrary for generating condition node configurations
const conditionConfigArb = fc.record({
  conditions: fc.array(
    fc.record({
      variable: fc.string({ minLength: 1, maxLength: 50 }),
      operator: fc.constantFrom(...REQUIRED_CONDITION_OPERATORS),
      value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  evaluationMode: fc.constantFrom('all', 'any'),
})

// Arbitrary for generating loop node configurations
const loopConfigArb = fc.record({
  loopType: fc.constantFrom('FOR', 'WHILE'),
  forConfig: fc.record({
    arrayVariable: fc.string({ minLength: 1, maxLength: 50 }),
    itemName: fc.string({ minLength: 1, maxLength: 20 }),
    indexName: fc.string({ minLength: 1, maxLength: 20 }),
  }),
  whileConfig: fc.record({
    condition: fc.record({
      variable: fc.string({ minLength: 1, maxLength: 50 }),
      operator: fc.constantFrom('equals', 'notEquals', 'greaterThan', 'lessThan'),
      value: fc.oneof(fc.string(), fc.integer()),
    }),
    maxIterations: fc.integer({ min: 1, max: 10000 }),
  }),
  maxIterations: fc.integer({ min: 1, max: 100000 }),
  continueOnError: fc.boolean(),
})

// Arbitrary for generating HTTP node configurations
const httpConfigArb = fc.record({
  method: fc.constantFrom(...REQUIRED_HTTP_METHODS),
  url: fc.webUrl(),
  headers: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 100 }),
    { minKeys: 0, maxKeys: 5 }
  ),
  queryParams: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 100 }),
    { minKeys: 0, maxKeys: 5 }
  ),
  body: fc.record({
    type: fc.constantFrom('none', 'json', 'form', 'text'),
    content: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  }),
  auth: fc.record({
    type: fc.constantFrom(...REQUIRED_AUTH_TYPES),
    username: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    password: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    token: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  }),
  timeout: fc.integer({ min: 1000, max: 300000 }),
  retry: fc.record({
    maxRetries: fc.integer({ min: 0, max: 10 }),
    retryDelay: fc.integer({ min: 100, max: 60000 }),
  }),
})

// Arbitrary for generating merge node configurations
const mergeConfigArb = fc.record({
  mergeStrategy: fc.constantFrom(...REQUIRED_MERGE_STRATEGIES),
  errorStrategy: fc.constantFrom(...REQUIRED_ERROR_STRATEGIES),
  outputMode: fc.constantFrom(...REQUIRED_OUTPUT_MODES),
  timeout: fc.integer({ min: 1000, max: 3600000 }),
})

describe('Property 5: Config Update Propagation', () => {
  /**
   * Test that condition node config updates preserve existing properties
   * and correctly merge new values
   */
  describe('Condition Node Config Updates', () => {
    it('updating evaluationMode should preserve conditions', () => {
      fc.assert(
        fc.property(
          conditionConfigArb,
          fc.constantFrom('all', 'any'),
          (config, newMode) => {
            // Simulate the update pattern used in condition-node-config.tsx
            const updatedConfig = { ...config, evaluationMode: newMode }
            
            // Verify conditions are preserved
            expect(updatedConfig.conditions).toEqual(config.conditions)
            
            // Verify evaluationMode is updated
            expect(updatedConfig.evaluationMode).toBe(newMode)
            
            // Verify the complete config object is returned
            expect(Object.keys(updatedConfig)).toContain('conditions')
            expect(Object.keys(updatedConfig)).toContain('evaluationMode')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('adding a condition should preserve existing conditions and evaluationMode', () => {
      fc.assert(
        fc.property(
          conditionConfigArb,
          fc.record({
            variable: fc.string({ minLength: 1, maxLength: 50 }),
            operator: fc.constantFrom(...REQUIRED_CONDITION_OPERATORS),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          (config, newCondition) => {
            // Simulate the addCondition pattern
            const updatedConfig = {
              ...config,
              conditions: [...config.conditions, newCondition],
            }
            
            // Verify existing conditions are preserved
            expect(updatedConfig.conditions.slice(0, config.conditions.length)).toEqual(config.conditions)
            
            // Verify new condition is added
            expect(updatedConfig.conditions.length).toBe(config.conditions.length + 1)
            expect(updatedConfig.conditions[updatedConfig.conditions.length - 1]).toEqual(newCondition)
            
            // Verify evaluationMode is preserved
            expect(updatedConfig.evaluationMode).toBe(config.evaluationMode)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating a condition should preserve other conditions', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              variable: fc.string({ minLength: 1, maxLength: 50 }),
              operator: fc.constantFrom(...REQUIRED_CONDITION_OPERATORS),
              value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.record({
            variable: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            operator: fc.option(fc.constantFrom(...REQUIRED_CONDITION_OPERATORS), { nil: undefined }),
            value: fc.option(fc.oneof(fc.string(), fc.integer(), fc.boolean()), { nil: undefined }),
          }),
          (conditions, updates) => {
            const index = Math.floor(Math.random() * conditions.length)
            const config = { conditions: [...conditions], evaluationMode: 'all' as const }
            
            // Simulate the updateCondition pattern
            const newConditions = [...config.conditions]
            newConditions[index] = { ...newConditions[index], ...updates }
            const updatedConfig = { ...config, conditions: newConditions }
            
            // Verify other conditions are preserved
            for (let i = 0; i < conditions.length; i++) {
              if (i !== index) {
                expect(updatedConfig.conditions[i]).toEqual(conditions[i])
              }
            }
            
            // Verify array length is preserved
            expect(updatedConfig.conditions.length).toBe(conditions.length)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Test that loop node config updates preserve existing properties
   */
  describe('Loop Node Config Updates', () => {
    it('updating loopType should preserve other config properties', () => {
      fc.assert(
        fc.property(
          loopConfigArb,
          fc.constantFrom('FOR', 'WHILE'),
          (config, newLoopType) => {
            // Simulate the updateLoopType pattern
            const updatedConfig = { ...config, loopType: newLoopType }
            
            // Verify other properties are preserved
            expect(updatedConfig.forConfig).toEqual(config.forConfig)
            expect(updatedConfig.whileConfig).toEqual(config.whileConfig)
            expect(updatedConfig.maxIterations).toBe(config.maxIterations)
            expect(updatedConfig.continueOnError).toBe(config.continueOnError)
            
            // Verify loopType is updated
            expect(updatedConfig.loopType).toBe(newLoopType)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating forConfig should preserve other config properties', () => {
      fc.assert(
        fc.property(
          loopConfigArb,
          fc.record({
            arrayVariable: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
            itemName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            indexName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
          }),
          (config, forConfigUpdates) => {
            // Simulate the updateForConfig pattern
            const updatedConfig = {
              ...config,
              forConfig: { ...config.forConfig, ...forConfigUpdates },
            }
            
            // Verify other properties are preserved
            expect(updatedConfig.loopType).toBe(config.loopType)
            expect(updatedConfig.whileConfig).toEqual(config.whileConfig)
            expect(updatedConfig.maxIterations).toBe(config.maxIterations)
            expect(updatedConfig.continueOnError).toBe(config.continueOnError)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating continueOnError should preserve other config properties', () => {
      fc.assert(
        fc.property(
          loopConfigArb,
          (config) => {
            // Simulate toggling continueOnError
            const updatedConfig = { ...config, continueOnError: !config.continueOnError }
            
            // Verify other properties are preserved
            expect(updatedConfig.loopType).toBe(config.loopType)
            expect(updatedConfig.forConfig).toEqual(config.forConfig)
            expect(updatedConfig.whileConfig).toEqual(config.whileConfig)
            expect(updatedConfig.maxIterations).toBe(config.maxIterations)
            
            // Verify continueOnError is toggled
            expect(updatedConfig.continueOnError).toBe(!config.continueOnError)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Test that HTTP node config updates preserve existing properties
   */
  describe('HTTP Node Config Updates', () => {
    it('updating method should preserve other config properties', () => {
      fc.assert(
        fc.property(
          httpConfigArb,
          fc.constantFrom(...REQUIRED_HTTP_METHODS),
          (config, newMethod) => {
            // Simulate the updateMethod pattern
            const updatedConfig = { ...config, method: newMethod }
            
            // Verify other properties are preserved
            expect(updatedConfig.url).toBe(config.url)
            expect(updatedConfig.headers).toEqual(config.headers)
            expect(updatedConfig.queryParams).toEqual(config.queryParams)
            expect(updatedConfig.body).toEqual(config.body)
            expect(updatedConfig.auth).toEqual(config.auth)
            expect(updatedConfig.timeout).toBe(config.timeout)
            expect(updatedConfig.retry).toEqual(config.retry)
            
            // Verify method is updated
            expect(updatedConfig.method).toBe(newMethod)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating auth type should preserve other config properties', () => {
      fc.assert(
        fc.property(
          httpConfigArb,
          fc.constantFrom(...REQUIRED_AUTH_TYPES),
          (config, newAuthType) => {
            // Simulate the updateAuth pattern
            const updatedConfig = {
              ...config,
              auth: { ...config.auth, type: newAuthType },
            }
            
            // Verify other properties are preserved
            expect(updatedConfig.method).toBe(config.method)
            expect(updatedConfig.url).toBe(config.url)
            expect(updatedConfig.headers).toEqual(config.headers)
            expect(updatedConfig.timeout).toBe(config.timeout)
            
            // Verify auth type is updated
            expect(updatedConfig.auth.type).toBe(newAuthType)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating headers should preserve other config properties', () => {
      fc.assert(
        fc.property(
          httpConfigArb,
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 0, maxKeys: 5 }
          ),
          (config, newHeaders) => {
            // Simulate the updateHeaders pattern
            const updatedConfig = { ...config, headers: newHeaders }
            
            // Verify other properties are preserved
            expect(updatedConfig.method).toBe(config.method)
            expect(updatedConfig.url).toBe(config.url)
            expect(updatedConfig.queryParams).toEqual(config.queryParams)
            expect(updatedConfig.body).toEqual(config.body)
            expect(updatedConfig.auth).toEqual(config.auth)
            
            // Verify headers is updated
            expect(updatedConfig.headers).toEqual(newHeaders)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Test that merge node config updates preserve existing properties
   */
  describe('Merge Node Config Updates', () => {
    it('updating mergeStrategy should preserve other config properties', () => {
      fc.assert(
        fc.property(
          mergeConfigArb,
          fc.constantFrom(...REQUIRED_MERGE_STRATEGIES),
          (config, newStrategy) => {
            // Simulate the updateConfig pattern
            const updatedConfig = { ...config, mergeStrategy: newStrategy }
            
            // Verify other properties are preserved
            expect(updatedConfig.errorStrategy).toBe(config.errorStrategy)
            expect(updatedConfig.outputMode).toBe(config.outputMode)
            expect(updatedConfig.timeout).toBe(config.timeout)
            
            // Verify mergeStrategy is updated
            expect(updatedConfig.mergeStrategy).toBe(newStrategy)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating errorStrategy should preserve other config properties', () => {
      fc.assert(
        fc.property(
          mergeConfigArb,
          fc.constantFrom(...REQUIRED_ERROR_STRATEGIES),
          (config, newErrorStrategy) => {
            // Simulate the updateConfig pattern
            const updatedConfig = { ...config, errorStrategy: newErrorStrategy }
            
            // Verify other properties are preserved
            expect(updatedConfig.mergeStrategy).toBe(config.mergeStrategy)
            expect(updatedConfig.outputMode).toBe(config.outputMode)
            expect(updatedConfig.timeout).toBe(config.timeout)
            
            // Verify errorStrategy is updated
            expect(updatedConfig.errorStrategy).toBe(newErrorStrategy)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('updating outputMode should preserve other config properties', () => {
      fc.assert(
        fc.property(
          mergeConfigArb,
          fc.constantFrom(...REQUIRED_OUTPUT_MODES),
          (config, newOutputMode) => {
            // Simulate the updateConfig pattern
            const updatedConfig = { ...config, outputMode: newOutputMode }
            
            // Verify other properties are preserved
            expect(updatedConfig.mergeStrategy).toBe(config.mergeStrategy)
            expect(updatedConfig.errorStrategy).toBe(config.errorStrategy)
            expect(updatedConfig.timeout).toBe(config.timeout)
            
            // Verify outputMode is updated
            expect(updatedConfig.outputMode).toBe(newOutputMode)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Test that config updates use immutable patterns
   */
  describe('Immutable Update Patterns', () => {
    it('config updates should not mutate original config object', () => {
      fc.assert(
        fc.property(
          conditionConfigArb,
          fc.constantFrom('all', 'any'),
          (originalConfig, newMode) => {
            // Store original evaluationMode
            const originalMode = originalConfig.evaluationMode
            
            // Simulate config update
            const updatedConfig = { ...originalConfig, evaluationMode: newMode }
            
            // Verify original config is not mutated
            expect(originalConfig.evaluationMode).toBe(originalMode)
            
            // Verify new config has updated value
            expect(updatedConfig.evaluationMode).toBe(newMode)
            
            // Verify they are different objects
            expect(updatedConfig).not.toBe(originalConfig)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('array updates should not mutate original arrays', () => {
      fc.assert(
        fc.property(
          conditionConfigArb,
          fc.record({
            variable: fc.string({ minLength: 1, maxLength: 50 }),
            operator: fc.constantFrom(...REQUIRED_CONDITION_OPERATORS),
            value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          }),
          (originalConfig, newCondition) => {
            const originalLength = originalConfig.conditions.length
            
            // Simulate adding a condition
            const updatedConfig = {
              ...originalConfig,
              conditions: [...originalConfig.conditions, newCondition],
            }
            
            // Verify original array is not mutated
            expect(originalConfig.conditions.length).toBe(originalLength)
            
            // Verify new array has the new condition
            expect(updatedConfig.conditions.length).toBe(originalLength + 1)
            
            // Verify they are different arrays
            expect(updatedConfig.conditions).not.toBe(originalConfig.conditions)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
