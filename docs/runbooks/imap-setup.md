# IMAP 接入运行手册

## 接入流程
1. 在 `/mailboxes` 页面填写邮箱地址、用户名、密码；如有需要，也可补充手工 `host` / `port` / `TLS` 配置。
2. 后端会调用 `validateImapMailbox`：
   - 如果提供了 `host`，直接走手工模式；
   - 如果未提供 `host`，先尝试 SRV 发现；未命中时再回退到内置 provider preset 或 `imap.<domain>` 推断。
3. 验证成功后，接口会返回 `settings` 与 `folders`；其中 `folders` 已经做过规范化处理，`INBOX` 默认选中。
4. 创建邮箱时，只会把选中的文件夹写入同步配置；后续初始同步与定时轮询也只处理这些被选中的文件夹。
5. 连接完成后，系统会触发 IMAP 初始同步；之后由定时任务持续投递 `imap-poll` 任务。

## 自动发现与手工回退
### 自动发现
当前实现的 discovery 返回三种来源：
- `manual`：用户手工填写了 `host`；
- `srv`：命中了 `_imaps._tcp.<domain>` SRV 记录；
- `fallback`：未命中 SRV 时回退到内置 provider preset 或 `imap.<domain>` 推断。

需要注意：当前代码里即使命中了内置 provider preset，`discoverySource` 也仍然会归类为 `fallback`，这是实现细节，不影响功能。

### 手工回退
如果自动发现失败，或者你要接入自建 / 非标准 IMAP 服务，可以手工填写：
- `host`
- `port`
- `secure`（TLS）

手工模式下：
- 若未填 `port`，默认使用 `993`；
- 若未填 `secure`，默认使用 `true`；
- 仍然会执行真实登录验证，不会跳过校验。

### 凭据注意事项
QQ、163 等邮箱通常要求使用 **IMAP 应用专用密码**，不能直接使用网页登录密码。若出现“密码正确但 IMAP 登录失败”，优先排查这一点。

## 环境变量与密钥
| 变量 | 说明 |
| --- | --- |
| `MAILBOX_CREDENTIALS_SECRET` | 用于封存 IMAP 密码。当前实现复用 mailbox credential store，把 IMAP 密码存进密文 token 字段。 |
| `MAIL_SYNC_QUEUE` | IMAP 初始同步、轮询、补拉都会通过该队列投递。 |
| Cron / scheduled handler | 定时枚举所有 IMAP mailbox，周期性发送 `provider: "imap", reason: "imap-poll"`。 |

## 部署后验收清单
1. 连接 IMAP 邮箱后，邮箱详情页应能展示 `validateImapMailbox` 返回的文件夹列表，且 `INBOX` 默认选中。
2. 如果自动发现成功，`imap_mailbox_state` 中应写入 `host`、`port`、`secure`、`discoverySource`、`lastValidatedAt`。
3. 如果自动发现失败，手工填写 `host` / `port` / `TLS` 后仍应能够完成验证并创建邮箱。
4. 连接完成后应触发 IMAP 初始同步，随后 `/inbox` 中能看到真实邮件。
5. 定时轮询运行后，新邮件应在无需重新连接的情况下进入 `/inbox`。
6. 每次轮询后，`imap_folder_cursor.lastSeenUid` / `lastPolledAt` 与 `imap_mailbox_state.lastPollAt` 等同步状态应持续前进或刷新。

## 常见故障排查
### 1. 自动发现失败
优先检查：
- 域名是否有 `_imaps._tcp` SRV 记录；
- 是否属于已内置 preset 的 provider；
- 若两者都不满足，是否可以直接使用 `imap.<domain>`。

若仍失败，直接改走手工模式。

### 2. 登录失败，但密码看起来正确
优先确认是否使用了 IMAP 专用密码。QQ、163 等邮箱最常见的问题就是这里。

### 3. 初始同步成功，但后续没有轮询结果
依次检查：
- scheduled handler 是否在运行；
- `MAIL_SYNC_QUEUE` 是否收到 `imap-poll`；
- 队列消费者是否能正常解密 IMAP 密码；
- `imap_folder_cursor` 是否持续更新。

### 4. 文件夹游标不前进
如果 `imap_folder_cursor.lastSeenUid` 长时间不变，说明队列轮询虽然可能触发了，但没有成功处理到新 UID。此时应查看队列日志，并核对该文件夹是否仍在已选中文件夹列表中。

### 5. 修改凭据后仍无法恢复
如果 `MAILBOX_CREDENTIALS_SECRET` 或 IMAP 密码发生变化，确保重新保存邮箱配置并重新部署 Worker；否则队列侧可能仍在使用旧密文。
