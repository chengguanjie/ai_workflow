# 各平台 OAuth/密钥获取与 .env 配置指引（留存）

用途：以后你有空时，按本文把 **公众号/小红书/抖音/视频号** 的控制台参数补齐到 `.env`，然后在系统里走 **“token 落库 + OAuth 回调”** 的授权闭环。

本项目入口：
- 授权入口页：`/settings/integrations`
- OAuth 回调路径（系统会用 `NEXT_PUBLIC_APP_URL` 生成 redirect_uri）：
  - `/api/integrations/xiaohongshu/callback`
  - `/api/integrations/douyin_video/callback`
  - `/api/integrations/wechat_channels/callback`

---

## 1) 哪些值从哪里来

### 一定来自平台控制台（创建应用后生成）
- `*_CLIENT_ID` / `*_CLIENT_SECRET`
  - 常见别名：`AppID/AppSecret`、`Client Key/Client Secret`、`Key/Secret`
- 回调地址配置（控制台里填）：必须与系统生成的 `redirect_uri` 一致

### 通常来自平台 OAuth 文档（多为固定 URL）
- `*_AUTHORIZATION_URL`
- `*_TOKEN_URL`

> 也可以配置成你自有网关的转发地址（便于后续做统一鉴权/限流/审计）。

### scope（权限范围）
- `*_SCOPES`：来自“控制台勾选的权限能力 + 官方文档对应的 scope 字符串”

---

## 2) 本地/线上回调域名怎么配

系统用以下优先级生成 redirect_uri：
1. `NEXT_PUBLIC_APP_URL`
2. `NEXTAUTH_URL`
3. 默认 `http://localhost:3000`

示例（本地 dev 跑在 3100）：
```env
NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"
NEXTAUTH_URL="http://127.0.0.1:3100"
```

线上则改成你的真实域名（必须是平台允许的回调域名/白名单内）。

---

## 3) token 落库前置：加密变量（必须）

```env
ENCRYPTION_KEY="<<<openssl rand -base64 32>>>"
ENCRYPTION_SALT="<<<openssl rand -base64 16>>>"
```

生成命令：
```bash
openssl rand -base64 32
openssl rand -base64 16
```

注意：`ENCRYPTION_SALT` 一旦线上使用后不要随意更换，否则历史加密数据无法解密。

---

## 4) 各平台如何获取（你有空时按这个找）

### A. 微信公众号（非 OAuth 落库）
入口：微信公众平台 `mp.weixin.qq.com`
- 路径（大致）：`设置与开发 -> 基本配置`
- 获取：
  - `WECHAT_MP_APP_ID`（AppID）
  - `WECHAT_MP_APP_SECRET`（AppSecret）

对应 `.env`：
```env
WECHAT_MP_APP_ID="<<<WECHAT_MP_APP_ID>>>"
WECHAT_MP_APP_SECRET="<<<WECHAT_MP_APP_SECRET>>>"
```

### B. 小红书（OAuth 落库）
入口：小红书开放平台（需开发者/主体认证）
1) 创建应用  
2) 在应用详情里拿到 `ClientId/AppId` 与 `ClientSecret`  
3) 在控制台配置“回调地址”（对应本系统 callback）  
4) 勾选权限/能力，按文档填写 scope

对应 `.env`：
```env
OAUTH_XHS_CLIENT_ID="<<<XHS_CLIENT_ID>>>"
OAUTH_XHS_CLIENT_SECRET="<<<XHS_CLIENT_SECRET>>>"
OAUTH_XHS_AUTHORIZATION_URL="<<<XHS_AUTHORIZATION_URL>>>"
OAUTH_XHS_TOKEN_URL="<<<XHS_TOKEN_URL>>>"
OAUTH_XHS_SCOPES="<<<XHS_SCOPES>>>"
```

### C. 抖音（OAuth 落库）
入口：抖音开放平台（需开发者/主体认证）
1) 创建应用（选择与你计划的授权方式匹配的应用类型）  
2) 获取 `Client Key/AppID` 与 `Client Secret`  
3) 配置授权回调地址（必须与系统生成一致）  
4) 勾选权限能力并配置 scope

对应 `.env`：
```env
OAUTH_DOUYIN_CLIENT_ID="<<<DOUYIN_CLIENT_ID>>>"
OAUTH_DOUYIN_CLIENT_SECRET="<<<DOUYIN_CLIENT_SECRET>>>"
OAUTH_DOUYIN_AUTHORIZATION_URL="<<<DOUYIN_AUTHORIZATION_URL>>>"
OAUTH_DOUYIN_TOKEN_URL="<<<DOUYIN_TOKEN_URL>>>"
OAUTH_DOUYIN_SCOPES="<<<DOUYIN_SCOPES>>>"
```

### D. 视频号（OAuth 落库）
入口：视频号相关开放平台/微信开放平台体系（通常需要主体资质）
1) 创建对应应用/开放能力配置  
2) 获取 `ClientId/Secret`（命名可能是 AppID/AppSecret 或 key/secret）  
3) 配置回调地址  
4) 配置 scope/权限范围

对应 `.env`：
```env
OAUTH_WECHAT_CHANNELS_CLIENT_ID="<<<CHANNELS_CLIENT_ID>>>"
OAUTH_WECHAT_CHANNELS_CLIENT_SECRET="<<<CHANNELS_CLIENT_SECRET>>>"
OAUTH_WECHAT_CHANNELS_AUTHORIZATION_URL="<<<CHANNELS_AUTHORIZATION_URL>>>"
OAUTH_WECHAT_CHANNELS_TOKEN_URL="<<<CHANNELS_TOKEN_URL>>>"
OAUTH_WECHAT_CHANNELS_SCOPES="<<<CHANNELS_SCOPES>>>"
```

---

## 5) 配完后如何验证（最短路径）

1) 重启 dev：确保读取最新 `.env`
2) 浏览器登录：`/login`
3) 进入：`/settings/integrations`
4) 点“连接”，看是否能跳转到平台授权页
5) 授权后会回调到本系统并自动回到 `/settings/integrations?connected=1`

常见问题：
- 页面提示缺少 `OAUTH_*`：说明 `.env` 没配齐或没重启。
- 回调报错：通常是“控制台回调地址不一致”或 `NEXT_PUBLIC_APP_URL` 与实际访问域名/端口不一致。

---

## 附：多模态内部文件访问（图片/视频/音频）

当工作流里引用本系统上传文件（形如 `/api/files/{fileKey}/download`）时：
- 图片：小图会自动内联为 `data:image/*;base64,...`；较大图片会生成短期签名下载链接供模型拉取。
- 视频：会生成短期签名下载链接供模型拉取（因为不适合内联）。
- 音频：作为“多模态音频输入”时，仅支持本系统文件或 `data:audio/...`；外部 URL 建议先走音频转录节点。

配置项（可选但推荐）：
```env
FILE_DOWNLOAD_TOKEN_SECRET="<<<your-random-secret>>>"
```
