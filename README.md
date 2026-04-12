# email-relay

## 项目概览
email-relay 是一个将 Gmail / Outlook / IMAP 邮箱统一拉入 Cloudflare Workers 的同步平台，前端通过 TanStack Router + shadcn/ui 提供管理控制台，后端在 Worker 中通过 Drizzle 访问 D1、通过 Cloudflare Queue 调度 `mail-sync` 队列，借助 Cloudflare Cron 维持观察、告警和重试。

## 计划执行状态
- 当前 2026-04-12 这批 implementation plan 的主要编码切片已经落地，最新审计见 `docs/superpowers/plans/2026-04-12-implementation-status.md`。
- 仍待完成的主要是 **真实 Cloudflare / OAuth / Queue / Cron 的生产验收**，以及是否回填各计划文件中的 checkbox。

## 接入与运维手册
- Gmail：`docs/runbooks/gmail-setup.md`
- Outlook / Microsoft 365：`docs/runbooks/outlook-setup.md`
- 通用 IMAP：`docs/runbooks/imap-setup.md`
- Sync Operations：`docs/runbooks/sync-operations.md`

## 管理员密码与环境变量约定
### 管理员密码
- 初次登录管理后台（`POST /admin/login`）必须提供 `ADMIN_BOOTSTRAP_PASSWORD` 作为密码，顺利登陆后会在响应里设置 `admin-session` cookie。上线后请在密钥管理平台（如 Alchemy secrets）中设置该变量，并避免在源码或提交中暴露这个值。

### 重要环境变量
| 类型 | 变量名 | 说明 |
| --- | --- | --- |
| 通用 | `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`CORS_ORIGIN`、`VITE_SERVER_URL` | 控制身份认证、回调/跨域和前端指向的服务器地址。|
| 密钥 | `MAILBOX_CREDENTIALS_SECRET`、`MAILBOX_OAUTH_STATE_SECRET` | 保护 IMAP 密码缓存与 OAuth 状态。|
| Gmail | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_OAUTH_REDIRECT_URL`、`GOOGLE_GMAIL_PUBSUB_TOPIC`、`GOOGLE_GMAIL_PUSH_TOKEN` | 用于搭建 Gmail OAuth、watch 推送和 Pub/Sub token。|
| Outlook | `MICROSOFT_CLIENT_ID`、`MICROSOFT_CLIENT_SECRET`、`MICROSOFT_OAUTH_REDIRECT_URL`、`MICROSOFT_NOTIFICATION_SECRET` | 用于生成 Outlook OAuth 授权、订阅通知的 clientState。|
| Cloudflare | `DB`（D1）、`MAIL_SYNC_QUEUE`（Queue）、`MAIL_SYNC_QUEUE` 绑定的 eventSource、Cron trigger、`admin` 相关 | 由 `packages/infra/alchemy.run.ts` 在部署时注入，上线前请确认 `turbo -F @email-relay/infra deploy` 能正确绑定这些资源。|

所有变量应通过环境文件（`apps/server/.env`、`apps/web/.env`）或部署平台注入，避免硬编码。可在 `.env.example` 中查看占位符。

## 本地开发
1. `pnpm install` 之后分别为各应用准备环境：
   - `apps/server/.env` 指向本地 Hono 服务（默认 `BETTER_AUTH_URL=http://localhost:3000`、`CORS_ORIGIN=http://localhost:3001`）；复制 `.env.example` 并填写 `ADMIN_BOOTSTRAP_PASSWORD` 以及 OAuth/secret 占位符。
   - `apps/web/.env` 只需设置 `VITE_SERVER_URL=http://localhost:3000`。
2. 数据准备：
   - `pnpm run db:push` 将 Drizzle schema 推送到本地 D1 模拟器。
   - `pnpm run db:generate` 在 packages/db 中更新客户端类型（可选）。
3. 启动开发服务器：
   - `pnpm run dev` 启动全套服务（web + server）。
   - 或者分别用 `pnpm run dev:web` 和 `pnpm run dev:server` 控制各自应用。
4. 测试与检查：`pnpm run test` / `pnpm run test:web` / `pnpm run check-types`（根据项目需要）。
5. 初次运行后，打开 `http://localhost:3001/_protected/inbox`，使用 `ADMIN_BOOTSTRAP_PASSWORD` 登录管理员控制台，再按需接入邮箱。

## Cloudflare 部署
- 执行 `pnpm run deploy`（等价于 `turbo -F @email-relay/infra deploy`），由 `packages/infra/alchemy.run.ts` 创建：
  - `server` Worker（入口 `apps/server/src/index.ts`）绑定 D1、`mail-sync` Queue、跨域配置、OAuth 变量，并注册两个 Cron：`0 */6 * * *` 与 `*/15 * * * *`；
  - `web` Vite Worker（入口 `apps/web` dist）将 `VITE_SERVER_URL` 注入前端；
  - `mail-sync` Queue 配置 `batchSize=10`、`maxRetries=5`、`retryDelay=30s`；
  - D1 数据库挂载 `packages/db/src/migrations` 目录。
- 部署完成后，`packages/db` 里的 `schema/mail.ts`、`schema/provider.ts` 等表会存储 `syncJob`、`syncAlert`、Gmail/Outlook 状态和 IMAP cursor，Worker 通过 `handleMailQueue` 处理队列事件。

## 页面作用
### 收件箱
`/_protected/inbox` 集中展示所有已同步邮件，内置搜索与过滤（`InboxSearchBar` + `InboxSidebar`）并在上方展示 `AlertSummaryCards`，帮助运维快速发现存在的告警。
### 邮箱
`/_protected/mailboxes` 提供 Gmail、Outlook 快速接入按钮和 IMAP 手动配置表单，卡片 (`MailboxStatusCard`) 追踪每个邮箱的连接状态与 provider。IMAP 表单会先调用 `mailboxes.validateImap`，再写入 `mailboxes.createImap`。
### 分组
`/_protected/groups` 支持创建逻辑分组 (`GroupForm`) 并列出所有分组；每行的 `BackfillForm` 可为分组一次性触发历史补拉、填充日期区间。
### Sync Operations
`/_protected/operations` 汇总 `AlertSummaryCards`，并分别为单个邮箱/分组提供历史补拉表单（对应 `operations.triggerMailboxBackfill` 与 `operations.triggerGroupBackfill`），用户填好日期范围后，后台会调用 `buildBackfillPayloads` 生成 `mail-sync` 任务。
### 告警面板
`/_protected/alerts` 展示 `syncAlert` 的列表（标题、详情、严重性、状态），支持人工点击 `Resolve`，同时触发 `alerts.summary` 与 `alerts.list` 查询刷新。

## 历史补拉
后台通过 `packages/api/src/operations/backfill.ts` 和前端 `operations` 页面协调：
- 操作页面或分组列表提交日期范围后，服务器调用 `buildBackfillPayloads`，生成 provider-agnostic 的 `mail-sync` payload（reason 包括 `gmail-backfill`、`outlook-backfill`、`imap-backfill`），并创建 `syncJob` 记录 `requestedRangeStart`/`requestedRangeEnd`。
- `apps/server/src/mail/queue.ts` 里会把 `reason` 区分为 `history-backfill` 类型，失败时 `handleSyncJobFailure` 会触发 `syncAlert`（高危 `auth-expired`、限流、临时失败）并调度重试。
- Cron 也会扫描 `retry-scheduled` job，把过期的历史补拉重新排队，保证在失败后自动恢复。

## 告警与重试
- 所有 `mail-sync` task 都由 `apps/server/src/mail/queue.ts` 处理，`classifySyncError`/`nextRetryDelaySeconds` 控制重试策略：OAuth 过期会标记 `retryable: false` 且创建高严重度 `syncAlert`，其它错误最多重试五次后才会跳出。
- `syncJob` 表记录每次尝试的 `retryCount`、`status`、`errorCategory`、`nextAttemptAt`，便于判断哪些任务正在退避、失败或已经完成。
- 当 `syncAlert` 生成后，前端的 `AlertSummaryCards`、`alerts.list`、`alerts.summary` 会同步展示告警数量，管理员可以在 `/alerts` 页面点击 `Resolve` 清理状态。

## 定时任务
- Cloudflare Cron 每 15 分钟和每 6 小时调用 `apps/server/src/mail/scheduled.ts` 的 `handleScheduled`：
  1. Gmail：当 watch 快过期或在 15 分钟未更新 (`lastPartialSyncAt`) 时，分别向队列发送 `gmail-renew-watch` 与 `gmail-history` 任务；
  2. Outlook：在订阅快到期前 12 小时，自动发起 `outlook-renew-subscription`；
  3. IMAP：周期性发 `imap-poll`，触发每个 `imapMailboxState` 轮询；
  4. Retry：扫描 `syncJob` 中 `retry-scheduled` 且 `nextAttemptAt` 已到的 `history-backfill`，调用 `buildBackfillPayloads` 重建 payload，并把 job 重新设为 `queued`。
- 这些 Cron 事件走向同一个 `MAIL_SYNC_QUEUE`，Queue 的 `handleMailQueue` 会根据 `payload.provider` 调用 Gmail / Outlook / IMAP 的同步逻辑，完成后 `message.ack()` 并更新数据库状态。
