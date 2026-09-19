# SERVER_INFO.md

本文件记录 email-relay 的实际部署事实。所有内容均来自实际执行的命令与接口响应，未经核验的信息不写入。敏感值一律脱敏，仅记录变量名。

## 部署形态

email-relay 是 Cloudflare Workers 应用，由 Alchemy（IaC）部署到 Cloudflare 边缘，**不落到任何自有服务器**。仓库中没有 `wrangler.toml`，资源定义全部在 `packages/infra/alchemy.run.ts`。

- Alchemy app：`email-relay`
- Stage：`mageia`
- Cloudflare 账号 ID：见 `.env` 的 `CLOUDFLARE_ACCOUNT_ID`

## 线上资源（2026-09-19 核验）

| 资源 | 名称 / 标识 | 说明 |
| --- | --- | --- |
| Server Worker | `email-relay-server-mageia` | 入口 `apps/server/src/index.ts`，导出 fetch / queue / scheduled |
| Web Worker | `email-relay-web-mageia` | Vite 静态资源，来自 `apps/web/dist` |
| D1 | `email-relay-database-mageia`（uuid `9b825fe3-6296-4fbb-b8b4-f7a3ce79e7ea`） | region APAC，read_replication `auto` |
| Queue | `email-relay-mail-sync` | batchSize 10 / maxRetries 5 / retryDelay 30s，1 consumer + 1 producer |
| Cron | `0 */6 * * *`、`*/15 * * * *` | 由 server Worker 注册 |

访问地址：

- Server：`https://email-relay-server-mageia.mageia.workers.dev`
- Web：`https://email-relay-web-mageia.mageia.workers.dev`

当前**没有自定义域**，全部走 workers.dev。

曾绑定 `mail-api.rateflow.site`（server）与 `mail.rateflow.site`（web），但该域名
已不可用：NS 指向 GoDaddy（`ns77/ns78.domaincontrol.com`）而非 Cloudflare，A 记录
解析到 `198.18.46.x`（RFC 2544 保留段，不可路由），TLS 握手直接失败。两个绑定已于
2026-09-19 通过 Workers domains API 解除，相关环境变量已改为 workers.dev。

## 部署命令

```bash
# 必须用 Node 22，原因见下节
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
npx turbo -F @email-relay/infra deploy
```

注意 **不要**使用 `pnpm deploy`：该名称与 pnpm 内置的 `deploy` 子命令冲突，会直接报
`ERR_PNPM_NOTHING_TO_DEPLOY`，不会执行 `package.json` 里的 deploy 脚本。

## 前置条件：Node 版本必须是 22

在 Node 26.8.1 下部署**必然失败**，报：

```
Error: Failed to update read replication mode for D1 database "..." (200): The API returned an invalid response
```

根因（已实测定位，非本项目代码缺陷）：`alchemy` 的 `safeFetch`
（`lib/util/safe-fetch.js`）会把 undici `Agent` 作为 `dispatcher` 传给 `fetch`。在
Node 26 下该组合会剥掉响应的 `content-encoding: gzip` 头却不解压，`response.json()`
因此拿到以 `1f 8b` 开头的原始 gzip 字节而抛错，被 alchemy 包装成上面这句误导性的
"invalid response"。实测对照：

| 环境 | content-encoding | body 是否为原始 gzip | JSON 可解析 |
| --- | --- | --- | --- |
| Node 26.8.1 + undici Agent | `null` | 是 | 否 |
| Node 22.22.1 + undici Agent | `gzip` | 否 | 是 |
| 任意版本，不带 dispatcher | `gzip` | 否 | 是 |

Cloudflare API 本身无问题：同一 PATCH 请求用 curl 返回 200 且 `success: true`。

本机 Node 22 路径：`~/.nvm/versions/node/v22.22.1/bin`。仓库未固定 Node 版本
（无 `.nvmrc` / `engines`），如需长期规避建议补上。

## 环境变量

通过 `packages/infra/alchemy.run.ts` 注入 Worker，来源为仓库根 `.env`（已被
`.gitignore` 排除）。以下 8 个走 `alchemy.secret.env`：`BETTER_AUTH_SECRET`、
`ADMIN_BOOTSTRAP_PASSWORD`、`MAILBOX_CREDENTIALS_SECRET`、
`MAILBOX_OAUTH_STATE_SECRET`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_GMAIL_PUSH_TOKEN`、
`MICROSOFT_CLIENT_SECRET`、`MICROSOFT_NOTIFICATION_SECRET`。

当前配置状态（仅记录是否已填，不记录值）：

- 已配置真实值：Cloudflare、Alchemy、管理员与加密三项、Gmail 全部五项
- **仍为占位符**：`MICROSOFT_CLIENT_ID`、`MICROSOFT_CLIENT_SECRET`、
  `MICROSOFT_NOTIFICATION_SECRET`。Gmail 与 IMAP 不受影响，但
  **Outlook 接入会失败**，需填入真实值后重新部署。

URL 类变量当前一律指向 workers.dev（2026-09-19 从失效的 rateflow.site 切换）：

| 变量 | 值 |
| --- | --- |
| `VITE_SERVER_URL` / `BETTER_AUTH_URL` | `https://email-relay-server-mageia.mageia.workers.dev` |
| `CORS_ORIGIN` | `https://email-relay-web-mageia.mageia.workers.dev` |
| `GOOGLE_OAUTH_REDIRECT_URL` | `…workers.dev/oauth/gmail/callback` |
| `MICROSOFT_OAUTH_REDIRECT_URL` | `…workers.dev/oauth/outlook/callback` |

`GOOGLE_GMAIL_PUBSUB_TOPIC` 中的 `rateflow-481905` 是 Google Cloud 项目 ID，与
失效的 rateflow.site 域名无关，**保持不变**。

注意 `apps/server/.env` 与 `apps/web/.env` 也各自含 URL 变量，但部署时以仓库根
`.env` 为准（`alchemy.run.ts` 按根 `.env` → 各子 `.env` 顺序加载，先加载者优先）。

> **改域名后必须同步更新 Google Cloud Console 的 OAuth 重定向 URI 白名单**，
> 否则 Gmail 授权会因 `redirect_uri_mismatch` 失败。该操作在 GCP 控制台，
> 不由本仓库管理。

## 数据库迁移

迁移目录 `packages/db/src/migrations`，由 Alchemy 在部署时应用，D1 侧记录在
`d1_migrations` 表。

| 迁移 | 应用时间 |
| --- | --- |
| 0000 – 0006 | 2026-04-12 13:49–13:50 |
| `0007_sync_dedupe_constraints.sql` | 2026-09-19 02:31:46 |

`0007` 会先去重再建立三个唯一索引。本次应用前业务表全空（mail_message /
mailbox_credential / imap_folder_cursor / mailbox 均为 0 行），因此去重
DELETE 未删除任何数据。

**该迁移不幂等**：`CREATE UNIQUE INDEX` 未加 `IF NOT EXISTS`，重复执行会报
`index already exists`。正常流程由 `d1_migrations` 跟踪，不会重跑。若在有数据的
库上应用，DELETE 会真实删除重复行，**执行前必须备份 D1**。

## 部署验证结果（2026-09-19 实测）

```
GET  /                                          -> 200 "OK"
GET  /admin/session（未登录）                    -> 401 {"authenticated":false}
GET  /oauth/gmail/start                          -> 302 accounts.google.com（redirect_uri 指向 workers.dev）
GET  /webhooks/outlook/notifications?validationToken=probe-12345
                                                 -> 200 原样回显 probe-12345
POST /webhooks/gmail/push?token=<错误值>          -> 403
GET  Web 前端 /                                   -> 200
```

迁移 0007 的效果已在 D1 上实测确认：

- 三个唯一索引均存在（`mail_message_mailbox_provider_message_idx`、
  `mailbox_credential_mailbox_provider_idx`、`imap_folder_cursor_mailbox_folder_idx`）
- 重复插入被拒绝：`UNIQUE constraint failed: mail_message.mailbox_id,
  mail_message.provider_message_id`
- 验证用的探针数据已删除，核验后 mailbox / mail_message / mail_message_fts 均为 0 行

### UI 重设计部署（2026-09-19 05:08 UTC，commit 32630f4）

纯前端改动，未触碰数据库：部署后 `d1_migrations` 仍停在 `0007`，未产生新迁移。

线上核验：

```
Server  GET /                                   -> 200 "OK"
Server  GET /admin/session（未登录）              -> 401 {"authenticated":false}
Server  /webhooks/outlook/...?validationToken=…  -> 200 原样回显
Server  POST /webhooks/gmail/push?token=<错误>   -> 403
Web     GET /                                    -> 200
```

前端产物核验（线上 CSS `/assets/index-DhgJC0Tg.css`）：

- `@font-face` 11 条，`Geist Variable` / `Geist Mono Variable` 已声明
- `Inter Variable` 出现 0 次（此前声明了该字体但从未加载任何字体文件）
- woff2 可直接访问：`/assets/geist-latin-wght-normal-*.woff2` → 200 `font/woff2`
- 新语义 token `--brand` / `--success` / `--warning` / `--hairline` 均已进入产物

## 未验证项

以下内容本次**没有**验证，不应假定其可用：

- Gmail 端到端同步：OAuth 授权回调、watch 注册、Pub/Sub 推送、history 增量拉取
- Outlook 全链路（凭据仍为占位符）
- IMAP 真实邮箱登录、游标推进、分页补拉
- 历史补拉的实际抓取结果与日期区间是否符合预期
- `message.retry()` 在真实 Queue 上的重投行为与退避时序
- Cron 触发的实际执行

这些都需要真实邮箱授权后才能验证。控制台可用性（登录、各页面人工走查）亦未验证。

## 回滚

- 代码：合并前的 main 为 `3deca24`，本次部署对应 `c4ca6c3`
- 迁移：`0007` 只新增索引 + 去重，无 down 迁移。如需回退需手工
  `DROP INDEX` 三个索引并删除 `d1_migrations` 中对应行
- 资源销毁：`npx turbo -F @email-relay/infra destroy`（**会删除 D1 与 Queue**，
  属高风险操作）
