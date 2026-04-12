# 2026-04-12 实施状态总览

## 审计范围
- `docs/superpowers/plans/2026-04-12-control-plane-and-unified-inbox-foundation.md`
- `docs/superpowers/plans/2026-04-12-generic-imap-connector-and-sync.md`
- `docs/superpowers/plans/2026-04-12-gmail-connector-and-sync.md`
- `docs/superpowers/plans/2026-04-12-operations-page.md`
- `docs/superpowers/plans/2026-04-12-outlook-connector-and-sync.md`
- `docs/superpowers/plans/2026-04-12-sync-operations-and-history-backfill.md`
- `docs/superpowers/plans/2026-04-12-sync-retry-resilience.md`

## 当前结论
当前仓库的**主要编码切片已经落地**：相关前后端文件、数据库迁移、测试用例和类型检查均已存在，并通过了本地自动化验证。现在真正还没有闭环的工作，集中在以下三类：

1. **真实环境验收**：Cloudflare Worker / D1 / Queue / Cron、Gmail Pub/Sub、Microsoft Graph webhook、真实 IMAP 服务都还需要在线上或 dev 环境逐项验证；
2. **计划追踪回填**：原始 plan 文件中的 checkbox 已开始部分回填，但仍未全部回填；
3. **计划与实现对齐**：个别计划中的文件落点与最终实现有轻微漂移，需要决定是接受现状还是回写计划说明。

## 自动化验证证据
- `pnpm test`：通过（38 个测试文件、63 个测试）
- `pnpm check-types`：通过

## 分计划状态
| 计划 | 编码状态 | 当前判断 | 仍待完成 |
| --- | --- | --- | --- |
| control-plane-and-unified-inbox-foundation | 已落地 | 管理员登录、受保护路由、收件箱/分组/告警/设置页面均已存在 | Cloudflare 部署验收、checkbox 回填 |
| generic-imap-connector-and-sync | 已落地 | IMAP discovery / validate / connect / poll / message sync 已存在 | 真实 IMAP 验收、checkbox 回填 |
| gmail-connector-and-sync | 已落地 | Gmail OAuth / label select / initial sync / history watch 已存在 | Gmail OAuth + Pub/Sub 真实验收、checkbox 回填 |
| operations-page | 已落地 | mailbox/group backfill、retry jobs、operations 页面均已存在 | checkbox/提交记录整理 |
| outlook-connector-and-sync | 已落地 | Outlook OAuth / folder mapping / delta sync / subscription 已存在 | Graph webhook 真实验收、checkbox 回填 |
| sync-operations-and-history-backfill | 已落地 | retry、backfill、FTS search、alert summary、stale-sync scan 已存在 | 生产演练、checkbox 回填 |
| sync-retry-resilience | 已落地 | queue 失败分类、retry-scheduled 重排逻辑已存在 | checkbox 回填 |

## 已执行的真实环境验证（2026-04-12）
### 部署结果
- 已执行：`pnpm run deploy`
- Web：`https://email-relay-web-mageia.mageia.workers.dev`
- Server：`https://email-relay-server-mageia.mageia.workers.dev`

### 已验证通过
- `GET /`：返回 `200 OK`
- `GET /admin/session`（未登录）：返回 `401`，符合预期
- `GET /oauth/gmail/start?redirectTo=/mailboxes`：返回 `302`
- `GET /oauth/outlook/start?redirectTo=/mailboxes`：返回 `302`
- `GET /webhooks/outlook/notifications?validationToken=hello-token`：返回 `200` 且回显 token
- `POST /webhooks/gmail/push?token=<wrong>`：返回 `403`
- `POST /webhooks/gmail/push?token=<correct>` 且使用不存在邮箱的合法测试 payload：返回 `202 Ignored`
- Web 根路径 `/`：返回 `200`
- Web SPA 路由 `/login`、`/_protected/inbox`：在携带 `Sec-Fetch-Mode: navigate` 的浏览器式请求下返回 `200`，说明 Cloudflare SPA fallback 正常；普通 `curl` 直接请求返回 `404` 不作为浏览器访问失败判定

### 已确认阻塞
- 当前根 `.env` 中 Gmail / Outlook OAuth 仍是 dummy / `your-server-domain` 占位值，因此线上 `/oauth/gmail/start` 与 `/oauth/outlook/start` 生成的跳转地址也仍是占位配置，无法继续完成真实 OAuth 验证
- `ADMIN_BOOTSTRAP_PASSWORD`、`BETTER_AUTH_SECRET`、`MAILBOX_CREDENTIALS_SECRET` 也仍是占位值；对线上 `POST /admin/login` 的实际请求返回 `401`，说明当前线上 secret 与本地占位值并不能完成真实管理员登录验收
- 因缺少真实 Gmail / Outlook / IMAP 凭据与正确 redirect / webhook 环境，后续“真实邮箱接入、初始同步、增量同步、cron 续订/轮询”仍然阻塞

## 本轮并行推进结果
本轮已补齐以下运维文档，便于后续真实环境联调：
- `docs/runbooks/gmail-setup.md`
- `docs/runbooks/outlook-setup.md`
- `docs/runbooks/imap-setup.md`
- `docs/runbooks/sync-operations.md`
- `README.md` 已加入状态入口与 runbook 索引
- 多份 implementation plan 已按“本地已完成 / 真实环境阻塞”原则开始回填 checkbox

## 计划与代码漂移
### 1. IMAP validate helper 的落点发生了调整
- 计划中写的是 `apps/server/src/mail/imap-validate.ts`
- 实际落地在 `packages/mail/src/imap/validate.ts`
- `packages/api/src/routers/mailboxes.ts` 直接复用共享 mail package 中的 `validateImapMailbox`，省掉了一层 server-only 包装

### 2. FTS 通过 migration 落地，而不是单独 schema 文件
- 计划中写的是 `packages/db/src/schema/search.ts`
- 实际落地为 `packages/db/src/migrations/0006_mail_message_fts.sql`
- `packages/api/src/inbox/repository.ts` 已直接查询 `mail_message_fts`

## 仍未完成的实际事项
### 必须在真实环境完成
1. Gmail：OAuth、watch 建立、Pub/Sub push、history 增量、watch 续订
2. Outlook：OAuth、validationToken 握手、Graph 通知、delta 增量、subscription 续订
3. IMAP：真实邮箱验证、初始同步、定时轮询、cursor 推进
4. Operations：mailbox/group backfill、retry-scheduled 自动重排、stale-sync alert、FTS 搜索联调
5. Control plane：完整 Cloudflare 部署后从 `/login` 到 `/alerts` 的人工验收

### 文档层面待决定
1. 是否回填 7 份 plan 中的 checkbox
2. 是否把“文件路径漂移”直接回写到对应 plan 文档中
