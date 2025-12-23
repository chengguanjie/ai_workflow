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

      db.onclose = () => {
        console.warn('IndexedDB connection closed unexpectedly')
        db = null
      }

      db.onversionchange = () => {
        db?.close()
        db = null
      }

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
 * Helper to run a transaction with automatic retry on connection failure
 */
async function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const execute = async () => {
    const database = await getDB()
    return new Promise<T>((resolve, reject) => {
      try {
        const transaction = database.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = operation(store)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      } catch (error) {
        reject(error)
      }
    })
  }

  try {
    return await execute()
  } catch (error: any) {
    if (error?.name === 'InvalidStateError' || error?.message?.includes('closing')) {
      console.warn('IndexedDB connection closed, resetting and retrying...')
      db = null
      return await execute()
    }
    throw error
  }
}

/**
 * 保存工作流到 IndexedDB
 */
export async function saveWorkflowOffline(workflow: OfflineWorkflow): Promise<void> {
  await runTransaction(STORES.WORKFLOWS, 'readwrite', (store) => store.put(workflow))
}

/**
 * 从 IndexedDB 获取工作流
 */
export async function getWorkflowOffline(id: string): Promise<OfflineWorkflow | null> {
  const result = await runTransaction<OfflineWorkflow>(STORES.WORKFLOWS, 'readonly', (store) => store.get(id))
  return result || null
}

/**
 * 删除 IndexedDB 中的工作流
 */
export async function deleteWorkflowOffline(id: string): Promise<void> {
  await runTransaction(STORES.WORKFLOWS, 'readwrite', (store) => store.delete(id))
}

/**
 * 获取所有待同步的工作流
 */
export async function getPendingWorkflows(): Promise<OfflineWorkflow[]> {
  return await runTransaction<OfflineWorkflow[]>(STORES.WORKFLOWS, 'readonly', (store) =>
    store.index('syncStatus').getAll('pending')
  )
}

/**
 * 添加待同步的更改
 */
export async function addPendingChange(change: Omit<PendingChange, 'id'>): Promise<string> {
  const id = `change_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  await runTransaction(STORES.PENDING_CHANGES, 'readwrite', (store) => store.add({ ...change, id }))
  return id
}

/**
 * 获取指定工作流的所有待同步更改
 */
export async function getPendingChanges(workflowId: string): Promise<PendingChange[]> {
  return await runTransaction<PendingChange[]>(STORES.PENDING_CHANGES, 'readonly', (store) =>
    store.index('workflowId').getAll(workflowId)
  )
}

/**
 * 删除已同步的更改
 */
export async function removePendingChange(changeId: string): Promise<void> {
  await runTransaction(STORES.PENDING_CHANGES, 'readwrite', (store) => store.delete(changeId))
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
