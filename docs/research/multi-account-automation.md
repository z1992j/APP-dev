# 多账号半自动化运营 — 方向重定 + 风控 + 三期路线

> 状态：**方向调整定稿**。从原先的「合规协作中台」转向「半自动化运营平台」。
> 触发：用户明确三大需求（多账号登录 + 自动操作 / AI 仿写工作流 / 沙盒隔离稳定运行）。
> 时间：2026-05

---

## 0. 用户需求的官方确认

> 1. 小红书网页版系统，可同时登录运行多个小红书账号，执行**发帖、评论浏览及回复、私信回复**（若可以）；
> 2. **增加帖子仿写生成功能**，给出参考 url 可以下载图片及仿写内容；流程参考 [aredink.com](https://aredink.com/) —— 复制参考帖链接 → 登录平台 → 粘贴 AI 提示词并替换 URL → 核对内容无误后提交发布；
> 3. 调研小红书风控逻辑，**尽量分核心加载每个账户沙盒稳定运行**。

仿写工作台的 AI 提示词模板（用户提供原文）：

```
帮我参考这条小红书，文案文字稍作修改表达一致意思，
城市、数字、运营商、套餐内容严格保持一致，
语气更口语自然，适合蓝 V 发布，
结尾简单引导咨询，
然后发送到我的小红书帖子，图片也用参考来源的。
帖子 URL：XXX
```

---

## 1. 红线再画 — 重要风险声明

这次的路线跨过了之前画的「不做自动登录、不做代发布」红线。在动手前必须诚实说清楚：

| 风险 | 严重度 | 说明 |
|---|---|---|
| **小红书账号封禁** | 🔴 高 | 行为风控会因「短时大量发帖 / 内容雷同 / 同 IP 多账号 / 同设备多账号」触发封号。指纹浏览器只解决"环境关联"，解决不了"行为风控"。 |
| **平台 ToS 违反** | 🔴 高 | 自动登录 + 代发布属于小红书明令禁止的"营销号"行为。平台有权封号 + 取消蓝 V 资质。 |
| **法律边界** | 🟡 中 | 用户授权下"代操作自己的账号"目前没有明确判例认定违法；但商业化 + 大规模 + 跨账号 = 灰色。法务建议出严格 ToS 让用户自担责任。 |
| **企业责任** | 🟡 中 | 若发生群发欺诈、违规广告等事件，平台可能追溯到服务提供方。需要审计日志 + 内容安全前置 + 用户实名注册。 |
| **产品稳定性** | 🟡 中 | XHS 反爬持续升级，每次 App / 网页改版可能需要紧急修复爬虫和 RPA。维护成本高。 |
| **AI 仿写版权** | 🟢 低 | 与参考帖相似度过高 + 商用 = 潜在著作权纠纷；提示词显式声明"参考"+"仿写"+"用户负责审核"可缓解。 |

**我建议**：
1. 用户协议（ToS）必须更新到包含「自动化操作风险自担 / 仅限合法授权账号 / 禁止刷量黑产」明文条款，**用户必须勾选确认才能开通自动化能力**。
2. 内置「行为节流」硬限制（每账号每日发帖 ≤3、评论 ≤30、私信 ≤50；随机延迟、错峰执行），让封号风险尽量分散到使用者侧。
3. 蓝 V / 专业号客户优先，普通号的风控敏感度高得多，建议产品默认只对蓝 V 开放完整自动化能力。

---

## 2. 参考产品拆解 — aredink.com 怎么做的

### 2.1 形态

- **服务端 SaaS** + **MCP 协议**（Model Context Protocol）暴露给 Claude / Cursor 等 AI 客户端
- 后端跑 **Playwright/headless Chromium 集群** 模拟用户浏览器操作
- 用户首次扫码登录后 cookie 在 aredink 服务端持久化
- 提供"一键自动发布""图文搜索""登录态保持"

### 2.2 推测架构

```
[ Claude / Cursor / Web ]
        │ MCP / HTTP
        ▼
[ aredink 服务端 ]
        │ JWT 鉴权 + 任务队列
        ▼
[ Playwright Worker 池 ]
        │ 每用户 / 每账号独立 BrowserContext
        │ 持久化 cookie + storage + fingerprint
        ▼
[ creator.xiaohongshu.com / xiaohongshu.com ]
```

### 2.3 关键能力对比

| 能力 | aredink | 我们 P0 | 我们目标 |
|---|---|---|---|
| 自动登录保活 | ✅ | ❌ | ✅ |
| 自动发图文 | ✅ | ❌ | ✅ |
| 自动发视频 | 未知 | ❌ | P2 |
| 评论自动回复 | 未知 | ❌ | P2 |
| 私信自动回复 | 未知（蓝 V 自带"自动回复模板"）| ❌ | P3 |
| AI 仿写参考帖 | ✅ | ❌ | ✅ Phase 1 |
| MCP / Agent 集成 | ✅ | ❌ | P3 |
| 多账号沙盒 | ✅ | ❌ | ✅ |
| 数据看板 | 未知 | ✅ | ✅ |
| 团队协作 | 未知 | ✅ | ✅ |

### 2.4 我们的差异化

- **AI 写作 + 协作 + 自动化** 三合一（aredink 偏 Agent 工具型，我们偏团队工作台）
- **更严的合规护栏** — 内置节流、行为审计、内容安全三层
- **蓝 V 优先** — 针对运营商 / 商户 / 品牌的高客单场景（用户提示词里也明确「适合蓝 V 发布」）
- **PC 网页主形态**（aredink 偏 API/MCP，缺一套好用的图形界面）

---

## 3. 小红书风控逻辑梳理

### 3.1 平台明示规则（来自 2026 新规）

- **一机一卡一号**：一个手机号、一个身份证只能绑定一个账号
- **实名 + 人脸**：异常行为触发强制实名 + 人脸识别
- **同 IP 矩阵全国跳 = 封号没商量**：矩阵账号必须 IP/地理位置统一
- **新号必须有正常社交互动**，否则被判定为"僵尸号"
- 内容雷同 / 互赞刷量 = 限流 + 封禁

### 3.2 风控信号（推测）

| 维度 | 平台采集的信号 | 防关联手段 |
|---|---|---|
| 设备指纹 | MAC、IMEI、Canvas 指纹、WebGL、字体、UA、屏幕分辨率 | 每账号独立 Chromium context + 指纹随机化 |
| IP | 同 IP 多账号、IP 类型（住宅/机房）、IP 地理位置 | 每账号绑定独立住宅 IP（代理池） |
| 行为序列 | 操作时间间隔、点击轨迹、滚动节奏、键盘动力学 | 模拟人类节奏 + 随机延迟 + 鼠标轨迹 |
| 频率 | 每日发帖/评论/私信数 | 硬性节流 + 错峰 |
| 内容雷同 | 文案相似度、图片 hash | AI 仿写时强制变体 + 图片轻微扰动 |
| 社交图谱 | 关注/粉丝/互动是否真实 | 平台级风控，无法绕开 |

### 3.3 关键结论

- **设备 + IP 隔离是底线，做了能解决 50% 风控**
- **行为风控是大头**，节流 + 错峰 + 随机化是必做
- **新号必死**：自动化对新号无效，平台对新号风控级别最高；建议产品只服务已养号 ≥30 天 + 粉丝 ≥1k 的账号
- **蓝 V 风控宽松一档**：身份明确、商业化合法、私信自带回复模板能力 — 这是产品的最优客群

---

## 4. 沙盒架构设计

### 4.1 整体

```
                         ┌─────────────────┐
                         │  Web (Next.js)  │   主控台
                         └────────┬────────┘
                                  │ REST + SSE
                         ┌────────▼────────┐
                         │ Server (NestJS) │
                         │ - 任务编排         │
                         │ - AI 仿写         │
                         │ - 内容安全         │
                         └────────┬────────┘
                                  │ Job (BullMQ + Redis)
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
         ┌────────────────┐              ┌────────────────┐
         │ Playwright     │              │ Playwright     │
         │ Worker A       │   ...        │ Worker N       │
         │                │              │                │
         │ Context 1 ─┐  │              │ Context 1 ─┐  │
         │ Context 2 ─┼─→ Browser launch + storageState   │
         │ Context 3 ─┘  │              │ Context 3 ─┘  │
         └────────┬───────┘              └────────┬───────┘
                  │ via 住宅代理 IP                  │
                  ▼                               ▼
              xiaohongshu.com / creator.xiaohongshu.com
```

### 4.2 每账号沙盒元素

| 元素 | 实现 |
|---|---|
| 浏览器 context | Playwright `browser.newContext({ storageState, userAgent, viewport, locale })` 每账号独立 |
| Cookie / localStorage | `storageState` JSON 持久化到 DB |
| User-Agent / 指纹 | UA 池 + 固定到该账号（保持稳定性） |
| 代理 IP | 每账号绑定一个住宅 IP；IP 失活时短信告警人工换 |
| 行为节流 | 全局任务队列 + 账号级 token bucket（每日上限 + 最小间隔）|
| 错峰执行 | 每账号有"活跃时段"（用户配置 9:00-22:00），任务排在窗口内随机时刻 |
| 鼠标 / 键盘模拟 | `page.mouse.move` 走人类风格曲线 + 输入有随机间隔 |
| 失败重试 | 指数退避 + 出现验证码立刻冻结账号通知用户 |

### 4.3 数据模型增量

```prisma
model XhsSession {
  id              BigInt   @id @default(autoincrement())
  accountId       BigInt   @unique   // 关联到现有 xhs_account
  storageState    Bytes              // Playwright storage state (encrypted)
  userAgent       String
  viewport        Json
  proxyId         BigInt?
  fingerprint     Json               // canvas/webgl seed 等
  status          String             // active | challenged | banned | needs_login
  loginAt         DateTime?
  lastUsedAt      DateTime?
  dailyQuota      Json               // {posts:3, comments:30, dms:50}
  activeWindow    Json               // {from:"09:00", to:"22:00", tz:"Asia/Shanghai"}
  createdAt       DateTime @default(now())
}

model Proxy {
  id              BigInt   @id @default(autoincrement())
  type            String             // residential | datacenter
  endpoint        String             // host:port
  credentials     String?            // encrypted user:pass
  geoCity         String?
  health          String   @default("healthy") // healthy | slow | dead
  lastCheckedAt   DateTime?
  assignedTo      XhsSession[]
}

model Job {
  id              BigInt   @id @default(autoincrement())
  teamId          BigInt
  accountId       BigInt?
  kind            String             // imitate | publish | comment.reply | dm.reply | data.sync
  payload         Json
  status          String             // queued | running | done | failed | canceled
  scheduledAt     DateTime?
  startedAt       DateTime?
  finishedAt      DateTime?
  attempts        Int      @default(0)
  lastError       String?
  resultRef       String?            // e.g., draft id, note url
  createdAt       DateTime @default(now())

  @@index([teamId, status, scheduledAt])
}

model RefNote {                       // 仿写参考帖缓存
  id              BigInt   @id @default(autoincrement())
  url             String   @unique
  fingerprint     String
  title           String?
  body            String?
  images          Json               // [{url, key (cos), w, h}]
  author          String?
  fetchedAt       DateTime @default(now())
}
```

---

## 5. 三期实施路线

### Phase 1：AI 仿写工作台（**本次完成，无浏览器自动化**）

只做：用户给一个 XHS 参考链接 → 我们解析帖子 → 下载图片到 COS → 调 AI 按用户提示词仿写 → 写入草稿。
发布动作仍然是用户手动跳到 creator.xiaohongshu.com（与现有 handoff 一致）。

**为什么先做这步**：
- 无浏览器自动化 = 无风控风险
- 价值即时可见（仿写是核心需求）
- 给后续自动化做好"内容生产管道"

**工作量**：3~5 天
- Schema：`RefNote`, `Job` (留作扩展)
- Backend：`imitate` 模块（fetcher + AI rewriter + draft creator）
- Web：`/imitate` 页面（粘贴 URL → 实时预览参考帖 → 流式仿写 → 一键存草稿）

### Phase 2：账号沙盒 + 自动登录 + 自动发布（**2~3 周**）

- 部署 Playwright 集群（每账号独立 context）
- 第一次登录：用户在 Web 端点"绑定账号" → Playwright 启动一个 context 打开 xiaohongshu.com → 截屏返回二维码给前端 → 用户手机扫码 → cookies 入库
- 任务队列 BullMQ + Redis
- 发布任务：定时执行 → 从草稿读取 → 在 creator.xiaohongshu.com 自动填表 + 上传 → 成功后回写 noteUrl
- 节流：每账号每日 ≤3 帖、最小间隔 30min、活跃窗口内随机

### Phase 3：评论与私信（**2~3 周**）

- 评论自动浏览：Playwright 周期性拉取笔记下评论列表 → 入库
- 评论自动回复：用户在 Web 端配置规则（关键词触发 / AI 智能回复）→ Job 调度回复
- 私信回复：蓝 V 账号可调用 XHS 自带"自动回复模板"接口；普通号走 Playwright DOM 模拟
- 内置内容安全（msgSecCheck）防恶意回复

### Phase 4：智能调度 + 代理 IP 池 + 风控告警（**2 周**）

- 代理 IP 池管理（购入住宅 IP，自动健康检查）
- 风控信号检测：登录态失效、验证码弹窗 → 冻结账号、通知用户
- 一键紧急停机：用户面板"暂停全部自动化"按钮
- 用户协议修订 + 强制勾选

### 总计：8~13 周到全功能

---

## 6. 商业模型调整

风险溢价 + 服务成本（代理 IP / Playwright 服务器）让客单价上升：

| 套餐 | 月价 | 配额 |
|---|---|---|
| 免费 | 0 | 仅 AI 仿写，不开自动化 |
| 个人 Pro | ¥99 | AI 仿写无限 + 1 账号自动化 + 每日 3 帖 |
| 团队 Starter | ¥499 / 月 | 5 账号自动化 + 1 个住宅 IP |
| 团队 Pro | ¥1,499 / 月 | 20 账号自动化 + 4 个住宅 IP + 私信回复 |
| 企业 | 议价 | 不限 + SLA + 专属客户经理 |

代理 IP 成本（住宅 ¥30~80/月每个）和 Playwright 服务器（每 50 账号约 1 个 4C8G 服务器）作为变动成本要算清楚。

---

## 7. 工作量与团队

| 阶段 | 工作量 | 关键依赖 |
|---|---|---|
| Phase 1 仿写 | 3~5 天 | Anthropic API key |
| Phase 2 自动登录 + 发布 | 2~3 周 | Playwright 服务器 + 1 个住宅 IP 测试 |
| Phase 3 评论 + 私信 | 2~3 周 | 蓝 V 测试账号若干 |
| Phase 4 调度 + 池 | 2 周 | 代理 IP 服务商签约 |
| **总计** | **8~13 周** | **2 后端 + 1 前端** |

---

## 8. 立项前必须确认

1. ⚠️ 用户协议草稿要不要外部律师审？（强烈建议）
2. 代理 IP 服务商：青果 / 巨量 / Bright Data，选 1 家先签
3. 测试账号：至少 3 个真实蓝 V 账号做内测（封号风险用户自担）
4. Playwright 服务器：阿里云 / 腾讯云 ECS，4C8G 起步
5. 灰度策略：先开 5 个种子客户、跑 4 周确认不封号再放量

---

## 9. 本次执行（Phase 1）

详见后续 commit。本次只做 Phase 1 仿写工作台。
