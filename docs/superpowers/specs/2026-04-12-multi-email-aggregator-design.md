# 多邮箱聚合管理系统设计文档

**日期：** 2026-04-12  
**项目：** email-relay  
**目标：** 在 Cloudflare 为主的架构上，构建一个单管理员使用的多邮箱聚合系统，支持 Gmail、Outlook 和通用 IMAP 邮箱接入，实现统一代收、统一收件箱、搜索/筛选、邮件查看、同步告警与历史补拉。

---

## 1. 背景与目标

用户需要一个集中管理大量邮箱的系统。目标邮箱来源包括 Gmail、Outlook、163、QQ 及其他支持 IMAP 的邮箱。系统的定位不是完整邮件客户端，而是一个“统一代收与管理后台”：

- 管理员在系统中集中接入多个邮箱
- 系统统一拉取邮件并进行标准化存储
- 管理员在统一收件箱中查看、搜索、筛选邮件
- 系统暴露同步状态、失败告警和历史补拉入口
- 一期不做复杂用户体系，只使用管理员密码登录

本项目明确追求：

- **Cloudflare 为主**：前端、控制 API、同步调度、存储、队列尽量放在 Cloudflare 上
- **先做最小闭环**：优先完成“能接入、能同步、能查看、能搜索”的最小可运行链路
- **分层设计**：OAuth 与 IMAP 差异隔离，但统一进入同一数据模型和收件箱体验
- **可观察性优先**：同步失败不可静默吞掉，必须进入任务和告警体系

---

## 2. 一期范围

### 2.1 一期必须完成

- 单管理员密码登录
- Gmail 接入
- Outlook 接入
- 通用 IMAP 接入
- 接入时自动发现优先，失败时允许管理员手动补充参数
- 默认不拉历史邮件
- 支持单邮箱手动补拉历史邮件
- 支持分组批量补拉历史邮件
- 保存完整正文（HTML / Text）
- 不保存附件内容，仅保存附件元数据
- 不保存 raw MIME
- 统一收件箱
- 左侧筛选（分组 / provider / 邮箱 / 状态）
- 基础搜索 + 全文搜索
- 后台告警面板
- 邮件状态仅在本系统内维护，不回写原邮箱
- 正文远程资源默认拦截，支持手动显示远程内容

### 2.2 一期明确不做

- 发信 / 回复 / 转发
- 草稿
- 完整线程化会话模型
- 双向状态同步到原邮箱
- 附件持久化存储
- 多管理员 / 多租户用户体系
- TOTP / WebAuthn / 2FA
- 自动保留策略清理
- AI 自动分类
- 高级搜索语法（如 Gmail 风格 query language）
- 完整邮件客户端级别的正文渲染优化

---

## 3. 关键产品决策

### 3.1 管理模式

- 仅有一个管理员入口
- 使用管理员密码登录
- 管理员 session 有效期为 **30 天**
- 后续可以升级 2FA，但一期不做

### 3.2 邮箱接入策略

- 一期同时支持：
  - Gmail
  - Outlook
  - 通用 IMAP
- 自动发现优先
- 若自动发现失败，允许手动补充：
  - host
  - port
  - ssl/tls
  - username
  - password / app password
- Gmail / Outlook 优先走 OAuth
- Gmail / Outlook 所需 OAuth 应用允许分阶段配置；一期按最少可跑版本推进

### 3.3 收件箱与信息架构

- 后台首页为 **统一收件箱**
- 整体结构为 **一个总收件箱 + 左侧筛选**
- 左侧筛选至少包括：
  - 分组
  - Provider
  - 邮箱
  - 同步状态
- 收件箱展示优先按来源邮箱聚合视角，不强求线程化

### 3.4 邮件数据与展示

- 保存完整正文（HTML / Text）
- 不保存附件内容
- 仅保存附件元数据
- 不保存 raw MIME
- 正文查看一期只做基础阅读体验
- 默认拦截远程图片 / 远程资源
- 管理员可手动点击“显示远程内容”

### 3.5 搜索

- 支持基础搜索：
  - 邮箱地址
  - 发件人
  - 主题
  - 时间范围
  - 未读 / 状态筛选
- 支持全文搜索：
  - 邮件正文全文检索
- 一期不做高级搜索语法

### 3.6 状态与同步语义

- 系统内部可以有自己的已读 / 标记 / 状态
- 一期**不回写**原邮箱
- 各邮箱 provider 能力不完全一致可接受
- 默认不拉历史邮件
- 历史邮件补拉由管理员主动触发

### 3.7 存储保留策略

- 一期默认长期保存
- 后续再补自动保留策略与清理机制

---

## 4. 总体架构

采用 **分层接入方案（推荐方案 B）**。

### 4.1 架构分层

1. **Admin Web**
   - 管理员登录
   - 统一收件箱
   - 邮箱接入与管理
   - 告警面板
   - 同步任务观察

2. **Control API**
   - 管理员认证
   - 邮箱接入编排
   - OAuth 回调
   - 自动发现与参数校验
   - 补拉历史任务发起
   - 同步状态与告警查询

3. **Connectors**
   - Gmail Connector
   - Outlook Connector
   - Generic IMAP Connector
   - 三者各自负责授权、拉取、增量同步与错误映射

4. **Sync Pipeline**
   - Cron 调度
   - Queue 投递与消费
   - 失败重试
   - 增量同步与历史补拉任务调度

5. **Storage / Search**
   - D1：业务数据、邮件数据、同步任务、告警
   - 邮件全文检索能力建立在数据库可实现的检索方案之上

### 4.2 设计原则

- Connector 是逻辑边界，不与统一数据模型耦死
- OAuth 与 IMAP 能力差异在接入层解决，不泄漏到上层 UI
- 同步任务和邮件实体分离建模
- 告警显式化，不允许静默失败
- 系统内 ID 与 provider 源 ID 分离

---

## 5. 核心数据模型

### 5.1 AdminConfig

系统级配置：
- 管理员密码哈希
- session 配置
- 全局默认同步参数

### 5.2 MailboxGroup

表示邮箱归属与逻辑组织：
- 个人
- 项目
- 客户
- 其他扩展分组

### 5.3 Mailbox

邮箱账号主实体，字段包括：
- email address
- provider type（gmail / outlook / imap）
- auth type（oauth / app-password / password）
- status（active / paused / auth-expired / error）
- selected folders
- last sync time
- last successful sync time
- group relation

### 5.4 MailboxCredential

敏感接入信息独立存储：
- OAuth access token / refresh token
- IMAP 凭据
- 过期时间 / 失效状态

### 5.5 MailMessage

统一标准化邮件实体，至少包括：
- internal id
- mailbox id
- provider message id
- internet message-id
- from / to / cc
- subject
- snippet
- html body
- text body
- sentAt / receivedAt
- system state flags
- header summary

### 5.6 MailAttachmentMeta

附件元数据：
- file name
- mime type
- size
- inline flag
- cid

### 5.7 SyncJob

同步任务实体：
- job type（initial / incremental / history / retry）
- target（single mailbox / group）
- status
- retry count
- start / finish timestamps
- error details

### 5.8 SyncAlert

告警实体：
- mailbox id
- provider
- alert type
- severity
- message
- createdAt
- resolvedAt

### 5.9 预留但一期不开放的结构

为未来扩展预留：
- 内部标签 / 分类结构
- 更细粒度的阅读状态
- 会话 / thread 结构

---

## 6. 接入与同步流程

### 6.1 Gmail 接入

- 管理员输入邮箱地址
- 系统识别为 Gmail
- 跳转 OAuth 授权
- 授权完成后建立 Mailbox 与 Credential
- 创建初始化 SyncJob
- 后续优先使用 push/watch + 增量同步
- 若 push 链路异常，回退到补偿轮询

### 6.2 Outlook 接入

- 管理员输入邮箱地址
- 系统识别为 Outlook
- 跳转 OAuth 授权
- 授权完成后建立 Mailbox 与 Credential
- 创建初始化 SyncJob
- 后续优先使用 Graph 增量 / 通知能力
- 通知不可用时退回增量轮询

### 6.3 通用 IMAP 接入

- 管理员输入邮箱地址
- 系统尝试自动发现 IMAP 参数
- 自动发现成功时提示输入凭据
- 自动发现失败时允许手动补充参数
- 连接验证成功后建立 Mailbox 与 Credential
- 一期按轮询模式进行同步

### 6.4 标准化入库链路

所有 provider 进入同一条标准化流程：
1. 拉取原始消息
2. 解析 headers / addresses / body / attachments meta
3. 统一转换为 MailMessage
4. 去重与映射
5. 写入搜索相关字段
6. 更新 Mailbox 同步状态
7. 失败则写 SyncJob error 与 SyncAlert

### 6.5 历史补拉

- 默认不自动拉历史邮件
- 支持按单邮箱手动补拉
- 支持按分组批量补拉
- 一期建议支持最近 7 / 30 / 90 天这种常用范围
- 更自由的自定义时间范围可以作为后续增强

---

## 7. 后台信息架构

### 7.1 主导航

建议主导航为：
- Inbox
- Alerts
- Mailboxes
- Groups
- Settings

### 7.2 Inbox 页面

- 默认首页
- 左侧筛选：
  - 总收件箱
  - 分组
  - Provider
  - 邮箱
  - 同步状态
- 顶部：搜索、时间范围、状态筛选
- 中间：邮件列表
- 右侧或详情页：邮件正文查看

### 7.3 Alerts 页面

用于集中显示：
- 授权失效
- 同步失败
- 限流
- 某邮箱长时间未同步
- 历史补拉失败

### 7.4 Mailboxes 页面

用于：
- 新增邮箱
- 查看邮箱接入状态
- 触发重连 / 重新授权
- 触发单邮箱补拉
- 查看最后同步时间

### 7.5 Groups 页面

用于：
- 分组管理
- 邮箱归属整理
- 分组批量补拉历史邮件

### 7.6 Settings 页面

用于：
- 管理员密码配置
- session 配置
- 默认同步参数
- 后续扩展的系统级策略

---

## 8. 安全与可靠性边界

### 8.1 管理员访问

- 单管理员模型
- 密码登录
- session 30 天
- 后续可升级 2FA / TOTP

### 8.2 凭据管理

- 凭据与 Mailbox 主表分离
- UI 不直接回显敏感值
- token / password 失效时强制显式告警

### 8.3 邮件内容安全

- 默认拦截远程资源
- 附件内容不持久化
- 不保存 raw MIME
- 只展示标准化正文与附件元数据

### 8.4 同步可靠性

- 所有同步都有 SyncJob
- 所有失败都进入 SyncAlert
- 区分可自动重试和需人工介入的错误
- 不允许 fallback 假成功

---

## 9. 技术方向与平台约束

### 9.1 Cloudflare 为主

一期优先将以下能力放在 Cloudflare：
- 前端管理台
- 控制 API
- OAuth 回调
- 调度
- 队列消费
- 存储 / 搜索

### 9.2 外部能力约束

Gmail、Outlook、IMAP 的接入能力天然不同：
- Gmail / Outlook 更适合增量与接近实时
- IMAP 更适合轮询
- 设计必须允许 provider 差异存在

### 9.3 规模目标

一期按 **50–500 个邮箱** 设计，因此必须从一开始就考虑：
- 队列
- 限流
- 重试
- 同步状态追踪
- 可观察性

---

## 10. 实施拆分（Epic 分解）

一期不应作为单一超大实现任务推进，建议拆为以下子项目：

### 子项目 1：控制面与统一收件箱骨架
- 管理员登录
- D1 数据模型
- 统一收件箱 UI
- 搜索 / 筛选基础框架
- SyncJob / SyncAlert 基础链路

### 子项目 2：Gmail 接入闭环
- Gmail OAuth
- Gmail 增量同步
- 标准化入库
- Inbox 可查看 / 可搜索

### 子项目 3：Outlook 接入闭环
- Outlook OAuth
- Graph 增量 / 通知接入
- 标准化入库

### 子项目 4：通用 IMAP 接入闭环
- 自动发现
- 手动补充参数
- IMAP 轮询同步
- 标准化入库

### 子项目 5：运维补强
- 告警面板完善
- 单邮箱补拉
- 分组补拉
- 限流 / 重试补强
- 失败可视化完善

---

## 11. MVP 交付原则

一期按“最小可运行闭环”推进：

1. 管理员登录
2. 添加一个邮箱
3. 成功同步一批邮件
4. 在统一收件箱中展示
5. 支持搜索和查看邮件详情

只要形成一个真实可运行的小闭环，就应尽快部署到 Cloudflare 进行观察与验证。

### 11.1 部署节奏原则（新增）

用户要求：**一旦实现了一个可运行的小功能，即可部署到 Cloudflare，便于观察。**

因此实施阶段必须遵循：
- 每完成一个可独立验证的垂直切片，就部署一次 Cloudflare
- 优先交付“可观察”的真实链路，而不是长时间本地堆积大改动
- 每次部署后都要验证：
  - 页面可访问
  - API 可访问
  - 当前新增功能在 Cloudflare 环境下真实可用
- 若某子功能需要真实第三方授权或环境变量，必须尽早在 Cloudflare 环境中完成接线，而不是拖到最后统一调试

这意味着开发节奏应偏向：
- 小步快跑
- 频繁部署
- 真实环境验证优先

---

## 12. 待后续规划的二期方向

- 发信 / 回复 / 转发
- 内部标签 UI
- 自动保留策略
- 多管理员与权限体系
- 更强的正文清洗能力
- 完整线程化会话模型
- 附件按需临时获取
- 高级搜索语法
- 二次认证 / 审计日志

---

## 13. 最终结论

本项目的一期不是“完整邮箱客户端”，而是一个 **Cloudflare 为主、单管理员、多邮箱接入、统一收件箱导向的邮件聚合管理后台**。其价值在于：

- 把多个来源邮箱集中到同一个管理面板中
- 用统一的数据模型承接 Gmail / Outlook / IMAP 差异
- 优先解决“代收、查看、搜索、同步、告警”的核心需求
- 通过小步部署的方式尽快在真实环境中验证产品可行性

该设计已得到用户批准，可进入详细实施计划阶段。
