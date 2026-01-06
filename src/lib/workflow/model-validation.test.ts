/**
 * Model Validation Tests
 * 
 * Tests for the model configuration validation and auto-fix functionality
 * 
 * Requirements: 1.4 - WHEN 节点配置中存在旧的非文本模型（如video-gen）
 *               THEN THE Debug_Panel SHALL 自动将其替换为默认文本模型
 */

import { describe, it, expect } from 'vitest'
import {
  validateAndFixModelConfig,
  isNonTextModel,
  getModelModality,
  SHENSUAN_DEFAULT_MODELS,
} from './model-validation'

describe('validateAndFixModelConfig', () => {
  describe('Non-text model detection and replacement', () => {
    it('should detect video-gen model and replace with default text model', () => {
      const config = {
        model: 'google/veo3.1-fast-preview',
        userPrompt: 'test prompt',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(true)
      expect(result.originalModel).toBe('google/veo3.1-fast-preview')
      expect(result.config.model).toBe(SHENSUAN_DEFAULT_MODELS.text)
      expect(result.config.modality).toBe('text')
    })

    it('should detect image-gen model and replace with default text model', () => {
      const config = {
        model: 'google/gemini-3-pro-image-preview',
        userPrompt: 'generate an image',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(true)
      expect(result.originalModel).toBe('google/gemini-3-pro-image-preview')
      expect(result.config.model).toBe(SHENSUAN_DEFAULT_MODELS.text)
      expect(result.config.modality).toBe('text')
    })

    it('should detect audio-tts model and replace with default text model', () => {
      const config = {
        model: 'runway/eleven_multilingual_v2',
        userPrompt: 'convert to speech',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(true)
      expect(result.originalModel).toBe('runway/eleven_multilingual_v2')
      expect(result.config.model).toBe(SHENSUAN_DEFAULT_MODELS.text)
    })

    it('should detect embedding model and replace with default text model', () => {
      const config = {
        model: 'openai/text-embedding-3-small',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(true)
      expect(result.originalModel).toBe('openai/text-embedding-3-small')
      expect(result.config.model).toBe(SHENSUAN_DEFAULT_MODELS.text)
    })
  })

  describe('Text model preservation', () => {
    it('should not modify text model configuration', () => {
      const config = {
        model: 'anthropic/claude-sonnet-4.5',
        userPrompt: 'test prompt',
        temperature: 0.7,
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(false)
      expect(result.originalModel).toBeUndefined()
      expect(result.config.model).toBe('anthropic/claude-sonnet-4.5')
      expect(result.config).toEqual(config)
    })

    it('should not modify code model configuration', () => {
      const config = {
        model: 'openai/gpt-5.1-codex-max',
        userPrompt: 'write code',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(false)
      expect(result.config.model).toBe('openai/gpt-5.1-codex-max')
    })
  })

  describe('Empty or missing model handling', () => {
    it('should handle empty model configuration', () => {
      const config = {
        userPrompt: 'test prompt',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(false)
      expect(result.config).toEqual(config)
    })

    it('should handle undefined model', () => {
      const config = {
        model: undefined,
        userPrompt: 'test',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(false)
    })

    it('should handle empty string model', () => {
      const config = {
        model: '',
        userPrompt: 'test',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(false)
    })
  })

  describe('Unknown model handling', () => {
    it('should not modify unknown model (not in any modality list)', () => {
      const config = {
        model: 'unknown/custom-model',
        userPrompt: 'test',
      }

      const result = validateAndFixModelConfig(config)

      // Unknown models are not modified (they might be custom models)
      expect(result.wasFixed).toBe(false)
      expect(result.config.model).toBe('unknown/custom-model')
    })
  })

  describe('Config preservation', () => {
    it('should preserve other config properties when fixing model', () => {
      const config = {
        model: 'ali/wan2.6-i2v',
        userPrompt: 'test prompt',
        systemPrompt: 'system prompt',
        temperature: 0.8,
        maxTokens: 1000,
        aiConfigId: 'config-123',
      }

      const result = validateAndFixModelConfig(config)

      expect(result.wasFixed).toBe(true)
      expect(result.config.userPrompt).toBe('test prompt')
      expect(result.config.systemPrompt).toBe('system prompt')
      expect(result.config.temperature).toBe(0.8)
      expect(result.config.maxTokens).toBe(1000)
      expect(result.config.aiConfigId).toBe('config-123')
    })
  })
})

describe('isNonTextModel', () => {
  it('should return true for video-gen models', () => {
    expect(isNonTextModel('google/veo3.1-fast-preview')).toBe(true)
    expect(isNonTextModel('ali/wan2.6-i2v')).toBe(true)
    expect(isNonTextModel('openai/sora2')).toBe(true)
  })

  it('should return true for image-gen models', () => {
    expect(isNonTextModel('google/gemini-3-pro-image-preview')).toBe(true)
    expect(isNonTextModel('bytedance/doubao-seedream-4.5')).toBe(true)
  })

  it('should return true for audio-tts models', () => {
    expect(isNonTextModel('runway/eleven_multilingual_v2')).toBe(true)
  })

  it('should return true for embedding models', () => {
    expect(isNonTextModel('openai/text-embedding-3-small')).toBe(true)
  })

  it('should return false for text models', () => {
    expect(isNonTextModel('anthropic/claude-sonnet-4.5')).toBe(false)
    expect(isNonTextModel('openai/gpt-5.2')).toBe(false)
    expect(isNonTextModel('google/gemini-3-pro-preview')).toBe(false)
  })

  it('should return false for code models', () => {
    expect(isNonTextModel('anthropic/claude-opus-4.5')).toBe(false)
  })

  it('should return false for unknown models', () => {
    expect(isNonTextModel('unknown/model')).toBe(false)
  })
})

describe('getModelModality', () => {
  it('should return correct modality for text models', () => {
    expect(getModelModality('anthropic/claude-sonnet-4.5')).toBe('text')
    expect(getModelModality('openai/gpt-5.2')).toBe('text')
  })

  it('should return correct modality for video-gen models', () => {
    expect(getModelModality('google/veo3.1-fast-preview')).toBe('video-gen')
  })

  it('should return correct modality for image-gen models', () => {
    expect(getModelModality('google/gemini-3-pro-image-preview')).toBe('image-gen')
  })

  it('should return null for unknown models', () => {
    expect(getModelModality('unknown/model')).toBeNull()
  })
})
