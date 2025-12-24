/**
 * AI Provider Cache
 * 用于缓存 AI 服务商配置，减少数据库查询和鉴权开销
 */

interface CacheEntry {
                  data: unknown;
                  timestamp: number;
                  organizationId: string;
}

// 简单的内存缓存，按组织ID存储
const providerCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 缓存有效期：60秒
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 清理间隔：5分钟

// 定期清理过期缓存
let cleanupTimer: NodeJS.Timeout | null = null;

function startCacheCleanup() {
                  if (cleanupTimer) return;
                  cleanupTimer = setInterval(() => {
                                    const now = Date.now();
                                    for (const [key, entry] of providerCache.entries()) {
                                                      if (now - entry.timestamp > CACHE_TTL_MS) {
                                                                        providerCache.delete(key);
                                                      }
                                    }
                  }, CACHE_CLEANUP_INTERVAL_MS);
}

// 获取缓存
export function getCachedProviders(
                  organizationId: string,
                  modality: string | null,
): unknown | null {
                  const cacheKey = `${organizationId}:${modality || "all"}`;
                  const entry = providerCache.get(cacheKey);

                  if (!entry) return null;

                  // 检查是否过期
                  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
                                    providerCache.delete(cacheKey);
                                    return null;
                  }

                  return entry.data;
}

// 设置缓存
export function setCachedProviders(
                  organizationId: string,
                  modality: string | null,
                  data: unknown,
): void {
                  const cacheKey = `${organizationId}:${modality || "all"}`;
                  providerCache.set(cacheKey, {
                                    data,
                                    timestamp: Date.now(),
                                    organizationId,
                  });

                  // 确保清理定时器已启动
                  startCacheCleanup();
}

// 使指定组织的缓存失效
export function invalidateProviderCache(organizationId: string): void {
                  for (const [key, entry] of providerCache.entries()) {
                                    if (entry.organizationId === organizationId) {
                                                      providerCache.delete(key);
                                    }
                  }
}
