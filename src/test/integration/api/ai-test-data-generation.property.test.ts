/**
 * Tests for AI Test Data Generation API
 *
 * Feature: workflow-test-mode
 * Property 5: AI 生成数据类型正确性
 *
 * Validates: Requirements 5.2, 5.5
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

type FieldDef = {
  name: string
  type: 'text' | 'image' | 'select' | 'multiselect'
  options?: Array<{ label: string; value: string }>
}

const TEXT_FIELDS: FieldDef[] = [
  { name: 'title', type: 'text' },
  { name: 'description', type: 'text' },
]

const IMAGE_FIELDS: FieldDef[] = [
  { name: 'avatar', type: 'image' },
  { name: 'cover', type: 'image' },
]

const SELECT_FIELDS: FieldDef[] = [
  { name: 'status', type: 'select', options: [{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }] },
  { name: 'priority', type: 'select', options: [{ label: 'High', value: 'high' }, { label: 'Low', value: 'low' }] },
]

const MULTISELECT_FIELDS: FieldDef[] = [
  { name: 'tags', type: 'multiselect', options: [{ label: 'Tag 1', value: 'tag1' }, { label: 'Tag 2', value: 'tag2' }] },
  { name: 'features', type: 'multiselect', options: [{ label: 'Feature A', value: 'featureA' }, { label: 'Feature B', value: 'featureB' }] },
]

function generateMockAIResponse(fields: FieldDef[]): string {
  const data: Record<string, string> = {}
  for (const field of fields) {
    if (field.type === 'text') data[field.name] = 'test text'
    else if (field.type === 'image') data[field.name] = 'https://picsum.photos/800/600'
    else if (field.type === 'select' && field.options?.length) data[field.name] = field.options[0].value
    else if (field.type === 'multiselect' && field.options?.length) data[field.name] = field.options.slice(0, 2).map((o) => o.value).join(',')
  }
  return JSON.stringify(data)
}

function validateDataType(value: string, field: FieldDef): boolean {
  if (value === undefined || value === null) return false
  if (field.type === 'text') return typeof value === 'string'
  if (field.type === 'image') { try { new URL(value); return true } catch { return false } }
  if (field.type === 'select' && field.options?.length) return field.options.map((o) => o.value).includes(value)
  if (field.type === 'multiselect' && field.options?.length) {
    const validValues = field.options.map((o) => o.value)
    return value.split(',').filter((v) => v).every((s) => validValues.includes(s))
  }
  return true
}

describe('AI Test Data Generation API - Property Tests', () => {
  const mockSession = { user: { id: 'u1', email: 't@t.com', name: 'T', role: 'ADMIN', organizationId: 'o1', organizationName: 'O' } }
  const mockWorkflow = { id: 'wf1', name: 'Test' }
  const mockApiKey = { id: 'k1', provider: 'SHENSUAN', keyEncrypted: 'enc', defaultModel: 'model', baseUrl: null }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workflow.findFirst).mockResolvedValue(mockWorkflow as never)
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(mockApiKey as never)
  })

  describe.each([
    { name: 'single title', fields: [TEXT_FIELDS[0]] },
    { name: 'title and description', fields: [TEXT_FIELDS[0], TEXT_FIELDS[1]] },
  ])('Property 5a: text fields - $name', ({ fields }) => {
    it('returns string values', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  describe.each([
    { name: 'single status', fields: [SELECT_FIELDS[0]] },
    { name: 'status and priority', fields: [SELECT_FIELDS[0], SELECT_FIELDS[1]] },
  ])('Property 5b: select fields - $name', ({ fields }) => {
    it('returns valid option values', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  describe.each([
    { name: 'single avatar', fields: [IMAGE_FIELDS[0]] },
    { name: 'avatar and cover', fields: [IMAGE_FIELDS[0], IMAGE_FIELDS[1]] },
  ])('Property 5c: image fields - $name', ({ fields }) => {
    it('returns valid URL format', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  describe.each([
    { name: 'single tags', fields: [MULTISELECT_FIELDS[0]] },
    { name: 'tags and features', fields: [MULTISELECT_FIELDS[0], MULTISELECT_FIELDS[1]] },
  ])('Property 5d: multiselect fields - $name', ({ fields }) => {
    it('returns valid option values', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  describe.each([
    { name: 'text and image', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'select and multiselect', fields: [SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
    { name: 'all types', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0], SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
  ])('Property 5e: mixed field types - $name', ({ fields }) => {
    it('returns correctly typed values', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.data.isAIGenerated).toBe(true)
      for (const f of fields) expect(validateDataType(data.data.data[f.name], f)).toBe(true)
    })
  })

  describe.each([
    { name: 'text and image', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0]] },
    { name: 'all types', fields: [TEXT_FIELDS[0], IMAGE_FIELDS[0], SELECT_FIELDS[0], MULTISELECT_FIELDS[0]] },
  ])('Property 5f: response field names - $name', ({ fields }) => {
    it('contains all requested field names', async () => {
      vi.mocked(aiService.chat).mockResolvedValue({ content: generateMockAIResponse(fields), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, finishReason: 'stop', model: 'model' })
      const req = new NextRequest('http://localhost/api/workflows/wf1/generate-test-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) })
      const res = await POST(req, { params: Promise.resolve({ id: 'wf1' }) })
      const data = await res.json()
      expect(res.status).toBe(200)
      for (const f of fields) expect(Object.keys(data.data.data)).toContain(f.name)
    })
  })
})
