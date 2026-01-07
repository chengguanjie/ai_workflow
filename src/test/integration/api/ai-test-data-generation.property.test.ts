/**
 * Tests for AI Test Data Generation API
 *
 * Feature: workflow-test-mode
 * Property 5: AI 生成数据类型正确性
 *
 * Validates: Requirements 5.2, 5.5
 * 
 * Note: These tests use pre-defined field arrays with describe.each to avoid
 * fast-check shrinking issues. The shrinking mechanism in fast-check can
 * produce invalid values that don't match the original generator constraints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/workflows/[id]/generate-test-data/route'

vi.mock('@/lib/db', () => ({
  prisma: {
    workflow: { findFirst: vi.fn() },
    apiKey: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/ai', () => ({ aiService: { chat: vi.fn() } }))
vi.mock('@/lib/crypto', () => ({ safeDecryptApiKey: vi.fn().mockReturnValue('key') }))

import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { aiService } from '@/lib/ai'

const FIELD_TYPES = ['text', 'image', 'select', 'multiselect'] as const
type FieldType = (typeof FIELD_TYPES)[number]

type FieldDef = {
  name: string
  type: FieldType
  options?: Array<{ label: string; value: string }>
}

// Pre-defined fixed field definitions
const TEXT_FIELDS: FieldDef[] = [
  { name: 'title', type: 'text' },
  { name: 'description', type: 'text' },
  { name: 'content', type: 'text' },
  { name: 'summary', type: 'text' },
  { name: 'notes', type: 'text' },
]

const IMAGE_FIELDS: FieldDef[] = [
  { name: 'avatar', type: 'image' },
  { name: 'cover', type: 'image' },
  { name: 'thumbnail', type: 'image' },
  { name: 'banner', type: 'image' },
  { name: 'photo', type: 'image' },
]

const SELECT_FIELDS: FieldDef[] = [
  { name: 'status', type: 'select', options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }] },
  { name: 'priority', type: 'select', options: [{ label: 'High', value: 'high' }, { label: 'Medium', value: 'medium' }, { label: 'Low', value: 'low' }] },
  { name: 'category', type: 'select', options: [{ label: 'Type A', value: 'typeA' }, { label: 'Type B', value: 'typeB' }] },
  { name: 'level', type: 'select', options: [{ label: 'Beginner', value: 'beginner' }, { label: 'Advanced', value: 'advanced' }] },
  { name: 'size', type: 'select', options: [{ label: 'Small', value: 'small' }, { label: 'Large', value: 'large' }] },
]

const MULTISELECT_FIELDS: FieldDef[] = [
  { name: 'tags', type: 'multiselect', options: [{ label: 'Tag 1', value: 'tag1' }, { label: 'Tag 2', value: 'tag2' }, { label: 'Tag 3', value: 'tag3' }] },
  { name: 'features', type: 'multiselect', options: [{ label: 'Feature A', value: 'featureA' }, { label: 'Feature B', value: 'featureB' }] },
  { name: 'skills', type: 'multiselect', options: [{ label: 'Skill X', value: 'skillX' }, { label: 'Skill Y', value: 'skillY' }, { label: 'Skill Z', value: 'skillZ' }] },
  { name: 'colors', type: 'multiselect', options: [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }, { label: 'Green', value: 'green' }] },
  { name: 'roles', type: 'multiselect', options: [{ label: 'Admin', value: 'admin' }, { label: 'User', value: 'user' }, { label: 'Guest', value: 'guest' }] },
]

function generateMockAIResponse(fields: FieldDef[]): string {
  const data: Record<string, string> = {}
  for (const field of fields) {
    if (field.type === 'text') {
      data[field.name] = 'test text'
    } else if (field.type === 'image') {
      data[field.name] = 'https://picsum.photos/800/600'
    } else if (field.type === 'select' && field.options?.length) {
      data[field.name] = field.options[0].value
    } else if (field.type === 'multiselect' && field.options?.length) {
      data[field.name] = field.options.slice(0, 2).map((o) => o.value).join(',')
    }
  }
  return JSON.stringify(data)
}

function validateDataType(value: string, field: FieldDef): boolean {
  if (value === undefined || value === null) return false
  if (field.type === 'text') return typeof value === 'string'
  if (field.type === 'image') {
    try { new URL(value); return true } catch { return false }
  }
  if (field.type === 'select' && field.options?.length) {
    return field.options.map((o) => o.value).includes(value)
  }
  if (field.type === 'multiselect' && field.options?.length) {
    const validValues = field.options.map((o) => o.value)
    const selected = value.split(',').filter((v) => v)
    return selected.every((s) => validValues.includes(s))
  }
  return true
}


describe('AI Test Data Generation API - Property Tests', () => {
  const mockSession = {
    user: { id: 'u1', email: 't@t.com', name: 'T', role: 'ADMIN', organizationId: 'o1', organizationName: 'O' },
  }
  const mockWorkflow = { id: 'wf1', name: 'Test' }
  const mockApiKey = { id: 'k1', provider: 'SHENSUAN', keyEncrypted: 'enc', defaultModel: 'model', baseUrl: null }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(mockApiKey as never)
  })

  // Property 5a: text fields return string values
  describe.each([
    { name: 'single title field', fields: [TEXT_FIELDS[0]] },
    { name: 'single description field', fields: [TEXT_FIELDS[1]] },
    { name: 'title and description', fields: [TEXT_FIELDS[0], TEXT_FIELDS[1]] },
    { name: 'content and summary', fields: [TEXT_FIELDS[2], TEXT_FIELDS[3]] },
    { name: 'title and content', fields: [TEXT_FIELDS[0], TEXT_FIELDS[2]] },
  ])('Property 5a: text fields - $name', ({ fields }) => {
    it('returns string values', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  // Property 5b: select fields return valid option values
  describe.each([
    { name: 'single status field', fields: [SELECT_FIELDS[0]] },
    { name: 'single priority field', fields: [SELECT_FIELDS[1]] },
    { name: 'status and priority', fields: [SELECT_FIELDS[0], SELECT_FIELDS[1]] },
    { name: 'category and level', fields: [SELECT_FIELDS[2], SELECT_FIELDS[3]] },
    { name: 'status and category', fields: [SELECT_FIELDS[0], SELECT_FIELDS[2]] },
  ])('Property 5b: select fields - $name', ({ fields }) => {
    it('returns valid option values', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  // Property 5c: image fields return valid URL format
  describe.each([
    { name: 'single avatar field', fields: [IMAGE_FIELDS[0]] },
    { name: 'single cover field', fields: [IMAGE_FIELDS[1]] },
    { name: 'avatar and cover', fields: [IMAGE_FIELDS[0], IMAGE_FIELDS[1]] },
    { name: 'thumbnail and banner', fields: [IMAGE_FIELDS[2], IMAGE_FIELDS[3]] },
    { name: 'avatar and thumbnail', fields: [IMAGE_FIELDS[0], IMAGE_FIELDS[2]] },
  ])('Property 5c: image fields - $name', ({ fields }) => {
    it('returns valid URL format', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })


  // Property 5d: multiselect fields return valid option values
  describe.each([
    { name: 'single tags field', fields: [MULTISELECT_FIELDS[0]] },
    { name: 'single features field', fields: [MULTISELECT_FIELDS[1]] },
    { name: 'tags and features', fields: [MULTISELECT_FIELDS[0], MULTISELECT_FIELDS[1]] },
    { name: 'skills and colors', fields: [MULTISELECT_FIELDS[2], MULTISELECT_FIELDS[3]] },
    { name: 'tags and skills', fields: [MULTISELECT_FIELDS[0], MULTISELECT_FIELDS[2]] },
  ])('Property 5d: multiselect fields - $name', ({ fields }) => {
    it('returns valid option values', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  // Property 5e: mixed field types all return correctly typed values
  describe.each([
    { name: 'text and image', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'select and multiselect', fields: [SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
    { name: 'text, select, image', fields: [TEXT_FIELDS[0], SELECT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'text and multiselect', fields: [TEXT_FIELDS[1], MULTISELECT_FIELDS[1]] },
    { name: 'image and select', fields: [IMAGE_FIELDS[1], SELECT_FIELDS[1]] },
    { name: 'text, image, select combo', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0], SELECT_FIELDS[0]] },
    { name: 'text, image, multiselect', fields: [TEXT_FIELDS[1], IMAGE_FIELDS[1], MULTISELECT_FIELDS[0]] },
    { name: 'two selects', fields: [SELECT_FIELDS[0], SELECT_FIELDS[1]] },
    { name: 'two multiselects', fields: [MULTISELECT_FIELDS[0], MULTISELECT_FIELDS[1]] },
    { name: 'two texts and image', fields: [TEXT_FIELDS[0], TEXT_FIELDS[1], IMAGE_FIELDS[0]] },
  ])('Property 5e: mixed field types - $name', ({ fields }) => {
    it('returns correctly typed values', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.data.isAIGenerated).toBe(true)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  // Property 5f: response contains all requested field names
  describe.each([
    { name: 'text and image', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'select and multiselect', fields: [SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
    { name: 'text, select, image', fields: [TEXT_FIELDS[0], SELECT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'all field types', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0], SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
    { name: 'multiple of each type', fields: [TEXT_FIELDS[0], TEXT_FIELDS[1], IMAGE_FIELDS[0], SELECT_FIELDS[0]] },
  ])('Property 5f: response field names - $name', ({ fields }) => {
    it('contains all requested field names', async () => {
      const mockResp = generateMockAIResponse(fields)
      vi.mocked(aiService.chat).mockResolvedValue({
        content: mockResp, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop', model: 'model',
      })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      const respFields = Object.keys(data.data.data)
      for (const f of fields) expect(respFields).toContain(f.name)
    })
  })
})
