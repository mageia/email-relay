# 同步运维 Runbook

## 日常操作
1. 打开管理后台的 `/_protected/operations` 页面，它会先通过 `orpc.alerts.summary` 拉取 `AlertSummaryCards` 中的三个指标（`openAlerts`，`staleMailboxes`，`retriesQueued`），这些指标分别来自 `packages/api/src/routers/alerts.ts` 中对 `syncAlert`、`syncJob`、`mailbox.lastSuccessfulSyncAt` 的统计，在出现高严重度告警或 `retry-scheduled` 任务累积时第一时间可见。
2. 在“按邮箱补拉”区块使用每张邮箱下的 `BackfillForm`（默认回退到最近 7 天，可自定义 `rangeStart`/`rangeEnd`），提交后前端会调用 `operations.triggerMailboxBackfill`，服务端通过 `enqueueMailboxBackfill` 插入 `syncJob`（记录 `requestedRangeStart`/`requestedRangeEnd`）并借助 `buildBackfillPayloads` 生成 provider-specific 的 payload（`reason` 为 `gmail-backfill` / `outlook-backfill` / `imap-backfill`）发给 `MAIL_SYNC_QUEUE`。
3. “按分组补拉”区块对每个 group 显示 `OperationsGroupBackfillSection` 的卡片，提交后会对组内所有邮箱各自写入 `syncJob` 并逐个执行 `buildBackfillPayloads`，重复调用 queue，做大范围历史补拉时优先用这个入口。
4. 重试区块列出 `orpc.operations.listRetryJobs` 查询出的所有 `status = retry-scheduled` 的 `syncJob`（按 `nextAttemptAt`/`createdAt` 排序），展示 mailbox address/provider/错误类别/消息和下次自动重试时间，可直接点击“立即重试”触发 `client.operations.retryJob`，其背后走 `requeueHistoryBackfillJob` 再次调度 `MAIL_SYNC_QUEUE` 并把 job 置为 `queued`。
5. 恢复完成后，可在同一页面或 `/alerts` 页面确认 `AlertSummaryCards` 中的 `openAlerts` 计数是否下降，必要时在 `/alerts` 页面点 `Resolve`，这是 `packages/api/src/routers/alerts.ts` 提供的 `resolve` procedure，直接把 `syncAlert.status` 置为 `resolved`。

## 失败/告警处理
- 队列消费端 `apps/server/src/mail/queue.ts` 的 `handleSyncJobFailure` 会调用 `classifySyncError`（`packages/mail/src/sync/retry.ts`）判断是否可重试：含 `invalid_grant`/`invalid credentials` 的错误被打为 `auth-expired` 直接 `failed` 并弹出高严重度告警，含 `rate`/`429` 的则继续退避，其余归类为 `temporary`；无论如何都会更新 `syncJob.retryCount`、`errorCategory`、`nextAttemptAt`（如果允许重试）和状态（`retry-scheduled` 或 `failed`）。
- `syncAlert` 通过 `toSyncAlertInput` 统一赋予 `type`（即告警类别）、`severity`、`title`、`detail`（含 `payload.provider`/`payload.reason`/错误信息），只有在 `retryable === false` 的时候才会插入表格，避免临时失败在重试中不断重复出现。
- Cron 任务 `apps/server/src/mail/scheduled.ts` 每 15 分钟/6 小时检查 `syncJob.status = retry-scheduled 且 nextAttemptAt <= now` 的条目，只要 job 是 `history-backfill` 类型且包含有效的 `requestedRangeStart`/`End`，就会再次调用 `buildBackfillPayloads` 生成 payload 给 queue，并把 job 恢复为 `queued`（`nextAttemptAt`/`startedAt` 清空），所以除非手动标记失败，默认会不断尝试。
- 同一个 Cron 也会查找连续 1 小时以上没有 `lastSuccessfulSyncAt` 的邮箱，调用 `selectStaleMailboxAlertCandidates` 过滤掉已有 open `stale-sync` 告警后，插入新的 `syncAlert`（detail 中包含邮箱地址及最近一次成功时间），并在 `alerts.summary` 中体现为 `staleMailboxes`。
- 发生 `auth-expired` 告警后，必须重新授权对应邮箱的 OAuth（Gmail/Outlook）或更新 IMAP 凭据，重新触发 `backfill` 或等待 `scheduled` job 重新跑一轮以验证恢复；告警解决后记得在 `/alerts` 页面点 `Resolve`，否则 `AlertSummaryCards` 会持续显示未解决告警。

## 搜索说明
- 前端 `/inbox` 页面中间的 `InboxSearchBar` 组件把输入传给 `orpc.inbox.listMessages` 的 `search` 参数（同时保留 provider/group/mailbox/status 过滤），后端 `packages/api/src/inbox/repository.ts` 里 `createInboxRepository.searchMessages` 检查到 `filters.search` 后不会走普通 `LIKE`，而是直接执行 D1 FTS 查询：SELECT...FROM `mail_message_fts` JOIN `mail_message` ... WHERE `mail_message_fts MATCH ?` ORDER BY `bm25(mail_message_fts)` + `received_at`，能跨邮箱/提供商查 subject/snippet/body text。
- 该 FTS 表在 `packages/db/src/migrations/0006_mail_message_fts.sql` 中创建：`mail_message_fts` 包含 `message_id`（UNINDEXED）、`subject`、`snippet`、`body_text`，并通过 insert/update/delete trigger 保持与 `mail_message` 同步，tokenizer 为 `unicode61 remove_diacritics 2`，更友好处理大小写与重音。只要 D1 数据库迁移成功（`pnpm run db:push`/`db:generate`），搜索查询就不需要额外配置。
- 搜索结果返回的字段包括 `subject`、`snippet`、`mailboxAddress`、`provider`，`InboxPage` 会按插值顺序渲染，`AlertSummaryCards` 也会显示最新告警状态，方便快速判断搜索结果对应的邮箱是否存在 pending 错误。

## 生产验收清单
1. 在 `/operations` 页面对某个邮箱提交历史补拉，确认 `syncJob` 表新增 `history-backfill` 记录、`requestedRangeStart`/`requestedRangeEnd` 与表单一致、`MAIL_SYNC_QUEUE` 收到对应 `provider` 的 `*_backfill` payload，并最终在 `operations` 页面的 `AlertSummaryCards` 中看到 `retriesQueued` 更新。
2. 在 `/groups` 或 `/operations` 的分组区块触发补拉，确认对于组内每个邮箱都依次写入 `syncJob` 并由 `buildBackfillPayloads` 生成多份 payload；所有 payload 都应在 queue 中完成同步，使 `group` 下的 `mailbox` 能在 `/inbox` 看到历史邮件。
3. 让任意 `mail-sync` task 抛出可重试错误（如网络抖动），观察 `syncJob` 进入 `retry-scheduled`、`nextAttemptAt` 根据 `packages/mail/src/sync/retry.ts` 的 `[30,60,120,300,900]` 延迟逐步变大；等待 Cron 触发 `scheduled.ts`，确认 `retry-scheduled` job 恢复 `queued` 并再次入队。
4. 人为触发 `invalid_grant` 类错误（或移除 OAuth 授权），验证 `handleSyncJobFailure` 将 job 标记 `failed`、创建一条 `syncAlert`（title 显示“邮箱授权失效”），并在 `/alerts` 页面以高严重度显示，解决凭据后在 `/alerts` 上点击 `Resolve`，`AlertSummaryCards` 的 `openAlerts` 应降到 0。
5. 在 `/inbox` 使用 `InboxSearchBar` 搜 subject/snippet/body，确认服务端命中 `mail_message_fts`（可以通过 Cloudflare D1 查询`mail_message_fts` 看匹配条目），返回的结果可以跨 Gmail/Outlook/IMAP 邮箱。
6. 停止某个 mailbox 的数据同步 1 小时以上（或手动更新时间戳），等待 Cron 触发 `stale-sync` 扫描，确保 `syncAlert` 表新增 `stale-sync` 类型记录，`AlertSummaryCards` 的 `staleMailboxes` 增加 1，并能通过 `/alerts` 页确认具体邮箱和最后成功时间。

## 排障要点
- **告警观测**：优先看 `/operations` 或 `/alerts` 中的 `AlertSummaryCards`；如果 `openAlerts` 或 `staleMailboxes` 维持在较高值，从 `syncAlert` 表查 `type`/`severity`/`detail`，`auth-expired` 是高危，`stale-sync` 表示 60 分钟未同步。
- **重试任务**：查询 `syncJob` 表的 `status` 字段，`retry-scheduled` 的 `nextAttemptAt`、`retryCount` 可决定是等待 Cron 还是手动点击重试。`operations.listRetryJobs` 的接口实现详细记录 `mailbox.address` 和 `provider`，可以在前端重试区块里直接观察。
- **补拉流程**：如果补拉任务没有实际同步，确认 `syncJob.startedAt`/`finishedAt` 是否被 `handleMailQueue` 更新，查看 queue handler 日志里是否 `claimSyncJob` 没拿到 job（说明 payload reason 与 job lock 不匹配）。必要时手动再触发一次 `operations.triggerMailboxBackfill` 或 `triggerGroupBackfill`。
- **FTS 搜索出错**：若 `/inbox` 搜索没结果或报错，先确认 `packages/db/src/migrations/0006_mail_message_fts.sql` 已跑，并用 D1 控制台查询 `mail_message_fts` 是否有人为字段；如果表存在但 `InboxSearchBar` 仍看不到数据，检查 `createInboxRepository.searchMessages` 的 `MATCH ?` 语句是否执行（可在 Worker log 中查 `db.execute` SQL）。
- **Stale Sync Alert 频繁**：`apps/server/src/mail/scheduled.ts` 会把 `lastSuccessfulSyncAt < now - 1h` 的 mailbox 选中。确认前端 `mailbox` 连接是否断开、任务是否持续失败，必要时重新触发补拉或刷新 OAuth，然后重置 `mailbox.lastSuccessfulSyncAt`（可通过手动同步一次或在 db 里更新）来让警告消失。
