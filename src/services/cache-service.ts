import { Redis } from 'ioredis'
import { getRedisConnection } from '@/lib/redis'

/**
 * 通用缓存服务
 * 
 * 使用 Redis 作为缓存后端，提供 JSON 序列化支持
 * 默认过期时间为 5 分钟
 */
export class CacheService {
        private static readonly DEFAULT_TTL = 300 // 5 minutes

        /**
         * 获取缓存实例
         */
        private static get redis(): Redis | null {
                return getRedisConnection()
        }

        /**
         * 生成缓存键
         * @param prefix 前缀
         * @param key 标识符
         */
        static generateKey(prefix: string, key: string): string {
                return `cache:${prefix}:${key}`
        }

        /**
         * 获取缓存数据
         * @param key 缓存键
         * @returns 缓存的数据对象或 null
         */
        static async get<T>(key: string): Promise<T | null> {
                const redis = this.redis
                if (!redis) return null

                try {
                        const data = await redis.get(key)
                        if (!data) return null
                        return JSON.parse(data) as T
                } catch (err) {
                        console.warn(`[Cache] Get error for key ${key}:`, err)
                        return null
                }
        }

        /**
         * 设置缓存数据
         * @param key 缓存键
         * @param value 数据对象
         * @param ttlSeconds 过期时间（秒），默认 300
         */
        static async set(key: string, value: unknown, ttlSeconds: number = this.DEFAULT_TTL): Promise<boolean> {
                const redis = this.redis
                if (!redis) return false

                try {
                        const data = JSON.stringify(value)
                        if (ttlSeconds > 0) {
                                await redis.setex(key, ttlSeconds, data)
                        } else {
                                await redis.set(key, data)
                        }
                        return true
                } catch (err) {
                        console.warn(`[Cache] Set error for key ${key}:`, err)
                        return false
                }
        }

        /**
         * 批量获取缓存
         * @param keys 缓存键数组
         */
        static async mget<T>(keys: string[]): Promise<(T | null)[]> {
                const redis = this.redis
                if (!redis || keys.length === 0) return Array(keys.length).fill(null)

                try {
                        const data = await redis.mget(keys)
                        return data.map(item => item ? JSON.parse(item) as T : null)
                } catch (err) {
                        console.warn(`[Cache] MGet error:`, err)
                        return Array(keys.length).fill(null)
                }
        }

        /**
         * 删除缓存
         * @param key 缓存键
         */
        static async del(key: string): Promise<boolean> {
                const redis = this.redis
                if (!redis) return false

                try {
                        await redis.del(key)
                        return true
                } catch (err) {
                        console.warn(`[Cache] Del error for key ${key}:`, err)
                        return false
                }
        }

        /**
         * 匹配删除缓存 (使用 SCAN)
         * @param pattern 匹配模式，如 "cache:templates:*"
         */
        static async deletePattern(pattern: string): Promise<number> {
                const redis = this.redis
                if (!redis) return 0

                let cursor = '0'
                let count = 0

                try {
                        do {
                                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
                                cursor = nextCursor

                                if (keys.length > 0) {
                                        await redis.del(keys)
                                        count += keys.length
                                }
                        } while (cursor !== '0')

                        return count
                } catch (err) {
                        console.warn(`[Cache] DeletePattern error for ${pattern}:`, err)
                        return 0
                }
        }

        /**
         * 获取并缓存（如果未命中）
         * @param key 缓存键
         * @param fetchFn 获取数据的函数
         * @param ttlSeconds 过期时间
         */
        static async getOrSet<T>(
                key: string,
                fetchFn: () => Promise<T>,
                ttlSeconds: number = this.DEFAULT_TTL
        ): Promise<T> {
                const cached = await this.get<T>(key)
                if (cached) return cached

                const data = await fetchFn()

                // 只有非空数据才缓存？视业务而定，这里假设都缓存
                if (data !== undefined) {
                        // 异步写入缓存，不阻塞返回
                        this.set(key, data, ttlSeconds).catch(err => {
                                console.warn(`[Cache] Async set error for key ${key}:`, err)
                        })
                }

                return data
        }
}
