/**
 * IndexedDB 存储模块
 * 提供离线工作流数据持久化存储
 */

import type { WorkflowConfig } from '@/types/workflow'

const DB_NAME = 'ai-workflow-offline'
const DB_VERSION = 1

// Store names
const STORES = {
  WORKFLOWS: 'workflows',
  PENDING_CHANGES: 'pendingChanges',
  SYNC_QUEUE: 'syncQueue',
} as const

// Workflow 数据结构
export interface OfflineWorkflow {
  id: string
  name: string
  description: string
  manual: string
  config: WorkflowConfig
  version: number
  lastModified: number
  syncStatus: 'synced' | 'pending' | 'conflict'
  serverVersion?: number
}

// 待同步的更改
export interface PendingChange {
  id: string
  workflowId: string
  type: 'create' | 'update' | 'delete'
  data: Partial<OfflineWorkflow>
  timestamp: number
  retryCount: number
}

let db: IDBDatabase | null = null

/**
 * 初始化 IndexedDB
 */
export async function initDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Workflows store
      if (!database.objectStoreNames.contains(STORES.WORKFLOWS)) {
        const workflowStore = database.createObjectStore(STORES.WORKFLOWS, { keyPath: 'id' })
        workflowStore.createIndex('syncStatus', 'syncStatus', { unique: false })
        workflowStore.createIndex('lastModified', 'lastModified', { unique: false })
      }

      // Pending changes store
      if (!database.objectStoreNames.contains(STORES.PENDING_CHANGES)) {
        const changesStore = database.createObjectStore(STORES.PENDING_CHANGES, { keyPath: 'id' })
        changesStore.createIndex('workflowId', 'workflowId', { unique: false })
        changesStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Sync queue store
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const queueStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true })
        queueStore.createIndex('workflowId', 'workflowId', { unique: false })
      }
    }
  })
}

/**
 * 获取 IndexedDB 实例
 */
async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    return initDB()
  }
  return db
}

/**
 * 保存工作流到 IndexedDB
 */
export async function saveWorkflowOffline(workflow: OfflineWorkflow): Promise<void> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.WORKFLOWS, 'readwrite')
    const store = transaction.objectStore(STORES.WORKFLOWS)

    const request = store.put(workflow)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * 从 IndexedDB 获取工作流
 */
export async function getWorkflowOffline(id: string): Promise<OfflineWorkflow | null> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.WORKFLOWS, 'readonly')
    const store = transaction.objectStore(STORES.WORKFLOWS)

    const request = store.get(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

/**
 * 删除 IndexedDB 中的工作流
 */
export async function deleteWorkflowOffline(id: string): Promise<void> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.WORKFLOWS, 'readwrite')
    const store = transaction.objectStore(STORES.WORKFLOWS)

    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * 获取所有待同步的工作流
 */
export async function getPendingWorkflows(): Promise<OfflineWorkflow[]> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.WORKFLOWS, 'readonly')
    const store = transaction.objectStore(STORES.WORKFLOWS)
    const index = store.index('syncStatus')

    const request = index.getAll('pending')

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 添加待同步的更改
 */
export async function addPendingChange(change: Omit<PendingChange, 'id'>): Promise<string> {
  const database = await getDB()
  const id = `change_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PENDING_CHANGES, 'readwrite')
    const store = transaction.objectStore(STORES.PENDING_CHANGES)

    const request = store.add({ ...change, id })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(id)
  })
}

/**
 * 获取指定工作流的所有待同步更改
 */
export async function getPendingChanges(workflowId: string): Promise<PendingChange[]> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PENDING_CHANGES, 'readonly')
    const store = transaction.objectStore(STORES.PENDING_CHANGES)
    const index = store.index('workflowId')

    const request = index.getAll(workflowId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * 删除已同步的更改
 */
export async function removePendingChange(changeId: string): Promise<void> {
  const database = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.PENDING_CHANGES, 'readwrite')
    const store = transaction.objectStore(STORES.PENDING_CHANGES)

    const request = store.delete(changeId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * 清除指定工作流的所有待同步更改
 */
export async function clearPendingChanges(workflowId: string): Promise<void> {
  const changes = await getPendingChanges(workflowId)

  for (const change of changes) {
    await removePendingChange(change.id)
  }
}

/**
 * 更新工作流同步状态
 */
export async function updateSyncStatus(
  workflowId: string,
  status: 'synced' | 'pending' | 'conflict',
  serverVersion?: number
): Promise<void> {
  const workflow = await getWorkflowOffline(workflowId)
  if (!workflow) return

  await saveWorkflowOffline({
    ...workflow,
    syncStatus: status,
    serverVersion: serverVersion ?? workflow.serverVersion,
  })
}

/**
 * 检查是否支持 IndexedDB
 */
export function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * 获取存储使用情况
 */
export async function getStorageUsage(): Promise<{ used: number; quota: number } | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate()
    return {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    }
  }
  return null
}

/**
 * 清理过期的离线数据
 */
export async function cleanupOldData(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const database = await getDB()
  const cutoffTime = Date.now() - maxAge

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORES.WORKFLOWS, 'readwrite')
    const store = transaction.objectStore(STORES.WORKFLOWS)
    const index = store.index('lastModified')

    const range = IDBKeyRange.upperBound(cutoffTime)
    const request = index.openCursor(range)

    request.onerror = () => reject(request.error)
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
      if (cursor) {
        // 只删除已同步的数据
        if (cursor.value.syncStatus === 'synced') {
          cursor.delete()
        }
        cursor.continue()
      } else {
        resolve()
      }
    }
  })
}
