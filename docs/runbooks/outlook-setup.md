# Outlook / Microsoft 365 接入运行手册

## 前置条件
1. 已部署可公网访问的 `apps/server` Worker，并保证 Microsoft Graph 可以访问其 HTTPS webhook 地址。
2. 具备 Microsoft Entra 管理权限，可创建应用注册、配置 Redirect URI、授予 Graph Delegated Permissions。
3. 部署环境已绑定 D1、`MAIL_SYNC_QUEUE` 与相关 secrets；Outlook 初始同步、delta 增量同步、订阅续订都依赖这些资源。
4. 管理后台已可正常访问，便于从 `/mailboxes` 页面发起 Outlook 授权。

## 环境变量
| 变量 | 说明 |
| --- | --- |
| `MICROSOFT_CLIENT_ID` | Entra 应用的 Client ID。 |
| `MICROSOFT_CLIENT_SECRET` | Entra 应用的 Client Secret。 |
| `MICROSOFT_OAUTH_REDIRECT_URL` | Outlook OAuth 回调地址，必须与 Entra 注册中的 Web Redirect URI 完全一致。 |
| `MICROSOFT_NOTIFICATION_SECRET` | Graph subscription 的 `clientState`；Webhook 端会严格校验该值。 |
| `MAILBOX_OAUTH_STATE_SECRET` | 用于签名和校验 Outlook OAuth state。 |
| `MAILBOX_CREDENTIALS_SECRET` | 用于封存 Outlook access/refresh token。 |
| `BETTER_AUTH_URL` | 用于构造 Graph notification URL，实际地址为 `${BETTER_AUTH_URL}/webhooks/outlook/notifications`。 |
| `CORS_ORIGIN` | OAuth 成功后前端跳转目标；回调完成后会跳回 `${CORS_ORIGIN}/mailboxes/<mailboxId>`。 |

## Entra / Graph 配置
1. 在 Microsoft Entra 中创建应用注册。
2. 添加 **Web** 类型 Redirect URI，值必须与 `MICROSOFT_OAUTH_REDIRECT_URL` 完全一致；典型值为 `https://<server-host>/oauth/outlook/callback`。
3. 给应用授予以下 **Delegated Permissions**：
   - `Mail.Read`
   - `MailboxSettings.Read`
   - `offline_access`
   - `openid`
   - `profile`
   - `email`
4. Graph subscription 的 Notification URL 配置为：
   `https://<server-host>/webhooks/outlook/notifications`
5. Graph subscription 的 `clientState` 必须与 `MICROSOFT_NOTIFICATION_SECRET` 相同。当前实现无论是首次创建订阅还是续订，都会使用该值。
6. 当前实现创建订阅时固定：
   - `resource = "/me/messages"`
   - `changeType = "created,updated"`
   - 过期时间默认设置为当前时间后约 24 小时
7. Graph 在创建 / 校验订阅时会附带 `validationToken`；当前 webhook 已实现原样回显该 token，无需额外开发逻辑。

## 部署后验收清单
1. 打开 `/mailboxes`，确认页面出现 Outlook 连接入口并能跳转到 Microsoft 授权页。
2. 完成授权后，浏览器应回到 `${CORS_ORIGIN}/mailboxes/<mailboxId>`。
3. 邮箱详情页应能展示并更新 Outlook 文件夹选择；更新后，`mailbox_folder` 与 `mailbox.selectedFoldersJson` 都应反映最新选择。
4. OAuth 回调完成后，系统会发送一条 `provider: "outlook", reason: "outlook-initial"` 的队列消息；随后 `/inbox` 中应能看到该 Outlook 邮箱的真实邮件。
5. Graph 对 `/webhooks/outlook/notifications` 发起 `validationToken` 校验时，应收到 200 + `text/plain` 原样 token。
6. 收到真实邮件变更通知后，Webhook 会入队 `provider: "outlook", reason: "outlook-delta"` 任务；随后 `outlook_mailbox_state.lastDeltaSyncAt` 与 `deltaLink` 应更新。
7. 定时任务会在 `subscriptionExpiresAt` 临近过期时发送 `outlook-renew-subscription`；确认续订后 `outlook_mailbox_state.subscriptionExpiresAt` 被刷新到未来时间。

## 常见故障排查
### 1. AADSTS50011 / redirect URI 不匹配
确认 Entra 应用注册中的 Web Redirect URI 与 `MICROSOFT_OAUTH_REDIRECT_URL` 完全一致，包括协议、域名、路径和尾部斜杠。

### 2. Webhook 返回 403
当前实现会校验每条非握手通知的 `clientState === MICROSOFT_NOTIFICATION_SECRET`。若不一致，Webhook 会直接拒绝请求。通常这是订阅配置和环境变量不一致导致的。

### 3. validationToken 校验失败
先确认 `${BETTER_AUTH_URL}/webhooks/outlook/notifications` 能被 Microsoft Graph 直接访问；再确认路由没有被 CDN / 代理改写掉 query string。

### 4. 首次接通成功，但后续没有增量同步
依次检查：
- `outlook_mailbox_state.subscriptionId` 是否已写入；
- Webhook 是否真的收到了通知；
- `MAIL_SYNC_QUEUE` 是否成功收到了 `outlook-delta`；
- `deltaLink` 是否在同步后持续更新。

### 5. 订阅过期后没有自动恢复
当前实现依赖 scheduled handler 在订阅快到期时发送 `outlook-renew-subscription`。如果过期后未恢复，优先检查 Cron 是否在运行、队列是否能消费、以及 `MICROSOFT_NOTIFICATION_SECRET` / OAuth token 是否仍然有效。
