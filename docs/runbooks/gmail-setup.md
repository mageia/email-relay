# Gmail 接入与运维手册

## 前置条件
1. 已部署可公网访问的 `apps/server` Worker，且 HTTPS 地址可被 Google OAuth 与 Pub/Sub push 访问。
2. 已准备 Google Cloud Project，并具备配置 Gmail API、Cloud Pub/Sub、OAuth Client 的权限。
3. 部署环境已绑定 D1、`MAIL_SYNC_QUEUE` 与必要密钥；Gmail 的初始同步、history 增量同步、watch 续订都依赖这些资源。
4. 管理后台已可正常登录，便于在 `/mailboxes` 页面发起 Gmail 连接。

## 环境变量
| 变量 | 说明 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth Web Client 的 Client ID。 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web Client 的 Client Secret。 |
| `GOOGLE_OAUTH_REDIRECT_URL` | Gmail OAuth 回调地址，必须与 Google Cloud 控制台中登记的 Redirect URI 完全一致。 |
| `GOOGLE_GMAIL_PUBSUB_TOPIC` | Gmail watch 使用的 Pub/Sub topic 全名，例如 `projects/<project-id>/topics/<topic-name>`。 |
| `GOOGLE_GMAIL_PUSH_TOKEN` | Gmail push webhook 的 query token；`POST /webhooks/gmail/push?token=...` 会校验此值。 |
| `MAILBOX_CREDENTIALS_SECRET` | 用于封存 OAuth access/refresh token。 |
| `MAILBOX_OAUTH_STATE_SECRET` | 用于签名和校验 Gmail OAuth state。 |
| `CORS_ORIGIN` | OAuth 成功后前端跳转目标的来源地址；回调完成后会跳回 `${CORS_ORIGIN}/mailboxes/<mailboxId>`。 |

## Google Cloud / Pub/Sub 配置
1. 在 Google Cloud Console 中创建或选择项目。
2. 启用 **Gmail API** 与 **Cloud Pub/Sub API**。
3. 创建 **Web application** 类型的 OAuth Client，并把 `GOOGLE_OAUTH_REDIRECT_URL` 配置为 Redirect URI；典型值为 `https://<server-host>/oauth/gmail/callback`。
4. 创建 Pub/Sub topic，并将其完整名称填入 `GOOGLE_GMAIL_PUBSUB_TOPIC`。
5. 创建 Pub/Sub push subscription，推送地址配置为：
   `https://<server-host>/webhooks/gmail/push?token=<GOOGLE_GMAIL_PUSH_TOKEN>`
6. 给 `gmail-api-push@system.gserviceaccount.com` 授予该 topic 的 **Pub/Sub Publisher** 权限，否则 Gmail 无法推送 watch 通知。
7. 当前实现会在 OAuth 成功后读取 Gmail label 列表，默认选中 `INBOX`，随后调用 `startGmailWatch(accessToken, topicName, labelIds)` 建立 watch，且 `labelFilterBehavior` 固定为 `include`。

## 部署后验收清单
1. 打开 `/mailboxes`，确认页面出现 Gmail 连接入口并能正常跳转到 Google 授权页。
2. 完成授权后，浏览器应回到 `${CORS_ORIGIN}/mailboxes/<mailboxId>`，且邮箱详情页能看到默认选中的 Gmail 标签（至少包含 `INBOX`）。
3. OAuth 回调完成后，系统会发送一条 `provider: "gmail", reason: "gmail-initial"` 的队列消息；随后 `/inbox` 中应能看到来自该 Gmail 邮箱的真实邮件。
4. 向 Gmail 邮箱发送新邮件后，Pub/Sub push 应命中 `POST /webhooks/gmail/push?token=...`，并由服务端入队 `provider: "gmail", reason: "gmail-history"` 任务。
5. 检查 `gmail_mailbox_state`：
   - `lastHistoryId` 在初始同步 / 增量同步后会更新；
   - `watchExpirationAt` 会在 watch 创建或续订后更新；
   - `lastPartialSyncAt` 会在 history 增量同步后刷新。
6. 定时任务会在 watch 即将过期时发送 `gmail-renew-watch`，并在 `lastPartialSyncAt` 超过 15 分钟未更新时补发 `gmail-history`；确认这两类任务都能正常进入队列。

## 常见故障排查
### 1. Webhook 返回 403
先检查 Pub/Sub push URL 中的 `token` 是否与 `GOOGLE_GMAIL_PUSH_TOKEN` 一致。当前实现会在 `handleGmailWebhook` 中直接比较 query token，不匹配就返回 403。

### 2. 无法建立 watch
优先检查两项：
- `GOOGLE_GMAIL_PUBSUB_TOPIC` 是否为完整 topic 名称；
- `gmail-api-push@system.gserviceaccount.com` 是否具有 Pub/Sub Publisher 权限。

### 3. OAuth 回调报 redirect URI 不匹配
确认 Google Cloud 中登记的 Redirect URI 与 `GOOGLE_OAUTH_REDIRECT_URL` 完全一致，包括协议、域名、路径与尾部斜杠。

### 4. 只有首次同步，没有后续增量同步
依次检查：
- Pub/Sub push 是否真的打到了 `/webhooks/gmail/push`；
- `GOOGLE_GMAIL_PUSH_TOKEN` 是否正确；
- `gmail_mailbox_state.lastHistoryId` 是否已写入；
- 定时任务是否持续补发 `gmail-history`。

### 5. history 任务持续失败
如果 `gmail-history` 持续失败，先看是否为凭据失效（例如 OAuth token 过期或失效），再检查 `lastHistoryId` 是否异常。当前实现不会自动回退为一次新的全量同步；运维上应重新授权邮箱，必要时重新触发补拉或重新连接该邮箱。
