import { describe, it, expect } from 'vitest'
import { WechatMpToolExecutor } from './wechat-mp'
import { XiaohongshuToolExecutor } from './xiaohongshu'
import { DouyinVideoToolExecutor } from './douyin-video'
import { WechatChannelsToolExecutor } from './wechat-channels'

describe('platform tool executors (testMode)', () => {
  it('oauth-driven executors should not require access token in testMode', async () => {
    const xhs = new XiaohongshuToolExecutor()
    const res1 = await xhs.execute(
      { action: 'publish', title: 't', content: 'c', images: [] },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res1.success).toBe(true)

    const dy = new DouyinVideoToolExecutor()
    const res2 = await dy.execute(
      { action: 'publish', title: 't', video_url: 'https://example.com/a.mp4' },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res2.success).toBe(true)

    const ch = new WechatChannelsToolExecutor()
    const res3 = await ch.execute(
      { action: 'publish', title: 't', video_url: 'https://example.com/a.mp4' },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res3.success).toBe(true)
  })

  it('wechat_mp should support testMode', async () => {
    const executor = new WechatMpToolExecutor()
    const res = await executor.execute(
      { operation: 'create_draft', title: 't', content: '<p>c</p>' },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res.success).toBe(true)
  })

  it('xiaohongshu should support testMode', async () => {
    const executor = new XiaohongshuToolExecutor()
    const res = await executor.execute(
      { action: 'publish', title: 't', content: 'c', images: [] },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res.success).toBe(true)
  })

  it('douyin_video should support testMode', async () => {
    const executor = new DouyinVideoToolExecutor()
    const res = await executor.execute(
      { action: 'publish', title: 't', video_url: 'https://example.com/a.mp4' },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res.success).toBe(true)
  })

  it('wechat_channels should support testMode', async () => {
    const executor = new WechatChannelsToolExecutor()
    const res = await executor.execute(
      { action: 'publish', title: 't', video_url: 'https://example.com/a.mp4' },
      { organizationId: 'org', userId: 'user', testMode: true }
    )
    expect(res.success).toBe(true)
  })
})
