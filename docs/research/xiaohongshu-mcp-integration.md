# 集成 xiaohongshu-mcp — 跳过 Phase 2 的 RPA 自研

> 触发：用户提供两个开源仓库
> - <https://github.com/xpzouying/xiaohongshu-mcp> — Go + go-rod 自动化后端
> - <https://github.com/xpzouying/x-mcp> — Chrome 扩展版（aredink 商业版背后）
>
> 结论：**直接采用 xiaohongshu-mcp 作为 Phase 2 的 RPA worker**，自研周期从 2~3 周压缩到 3~5 天。

---

## 1. xiaohongshu-mcp 拆解

### 1.1 技术栈

| 维度 | 实现 |
|---|---|
| 语言 | Go 1.24 |
| 浏览器自动化 | [`go-rod`](https://github.com/go-rod/rod)（headless Chromium 控制器，MIT）|
| 浏览器封装 | `xpzouying/headless_browser` —— 处理 Chromium 启动 + cookie 注入 + 代理 |
| HTTP 框架 | Gin |
| MCP | `modelcontextprotocol/go-sdk` |
| Cookie | 本地文件持久化（**单进程单账号**）|
| 代理 | `XHS_PROXY` 环境变量 |
| 部署 | Dockerfile（含 ARM64）+ docker-compose |

### 1.2 已实现的能力

```
GET    /api/v1/login/status            检查登录态
GET    /api/v1/login/qrcode            生成扫码二维码
DELETE /api/v1/login/cookies           重置登录
POST   /api/v1/publish                 发布图文（标题、正文、tags、图片本地路径、定时、原创、可见范围、商品）
POST   /api/v1/publish_video           发布视频
GET    /api/v1/feeds/list              首页 feeds 列表
POST   /api/v1/feeds/search            搜索笔记
POST   /api/v1/feeds/detail            笔记详情 + 评论加载
POST   /api/v1/feeds/comment           发表评论
POST   /api/v1/feeds/comment/reply     回复评论
POST   /api/v1/user/profile            他人主页
GET    /api/v1/user/me                 我的主页
Any    /mcp                            MCP streamable HTTP
```

### 1.3 关键 DOM 选择器（已在生产验证）

| 操作 | 选择器 / 路径 |
|---|---|
| 已登录判断 | `.main-container .user .link-wrapper .channel` |
| 扫码二维码 | `.login-container .qrcode-img` (src 属性) |
| 发布页入口 | `https://creator.xiaohongshu.com/publish/publish?source=official` |
| 切换图文 Tab | `div.creator-tab` 内含 "上传图文" 文本 |
| 上传图片 input | `div.upload-content` 内的 `input[type=file]` |
| 上传完成检测 | `.img-preview-area .pr` 数量 = expected |
| 标题输入 | `div.d-input input` |
| 正文输入 | 富文本编辑器（编辑器内 contenteditable）|
| Tag 输入 | 在正文中 `#xxx ` |
| 发布按钮 | `button.publishBtn` |
| 评论输入框 | `div.input-box div.content-edit span` → `p.content-input` |
| 评论提交按钮 | `div.bottom button.submit` |

### 1.4 反爬适应措施（已内置）

- 鼠标随机轨迹（`humanDelayRange` 300-700ms）
- 阅读节奏（`readTimeRange` 500-1200ms）
- 滚动随机化 + 触底重试
- 弹窗自动消除（`removePopCover`）
- DOM 稳定等待（`page.WaitDOMStable`）
- 重试机制（`avast/retry-go`）
- 上传图片 60s 超时 + 数量递增检测

### 1.5 局限

| 问题 | 备注 |
|---|---|
| **单进程单账号** | cookie 走单一文件路径，一个实例只能服务一个 XHS 账号 |
| 仅本地图片路径 | publish 要求 `ImagePaths []string` 必须是文件系统路径，需要先下载到 worker 本地 |
| 无内置任务队列 | 一次一个请求，并发需要外部排队 |
| 无指纹随机化 | 多账号需要不同的浏览器二进制/容器实例来隔离设备指纹 |

---

## 2. 集成架构

```
┌───────────────────────────────────────────────────────────────┐
│ 用户浏览器                                                      │
│   Next.js Web (apps/web)                                       │
└─────────────────┬─────────────────────────────────────────────┘
                  │ REST + SSE
┌─────────────────▼─────────────────────────────────────────────┐
│ RedMatrix 主控 (apps/server, NestJS)                            │
│   - JWT / 团队 / 草稿 / AI 仿写                                  │
│   - 新增 automation 模块：                                       │
│       · 任务编排（BullMQ on Redis）                              │
│       · 账号 → Worker 实例路由                                   │
│       · 节流（每账号每日上限 / 错峰 / 随机延迟）                    │
│       · 图片下载到 worker 共享卷                                  │
└─────────────────┬─────────────────────────────────────────────┘
                  │ HTTP (内网)
                  │
       ┌──────────┼──────────┬──────────┐
       ▼          ▼          ▼          ▼
   ┌──────┐  ┌──────┐   ┌──────┐   ┌──────┐
   │xhs   │  │xhs   │   │xhs   │   │xhs   │
   │mcp   │  │mcp   │   │mcp   │   │mcp   │
   │实例 1│  │实例 2│   │实例 3│   │实例 N│
   │账号 A │  │账号 B │   │账号 C │   │账号 X │
   │       │  │       │   │       │   │       │
   │独立    │  │独立    │   │独立    │   │独立    │
   │Cookie  │  │Cookie  │   │Cookie  │   │Cookie  │
   │卷      │  │卷      │   │卷      │   │卷      │
   │+代理 IP│  │+代理 IP│   │+代理 IP│   │+代理 IP│
   └──┬───┘  └──┬───┘   └──┬───┘   └──┬───┘
      │         │          │           │
      ▼         ▼          ▼           ▼
            xiaohongshu.com / creator.xiaohongshu.com
```

### 2.1 容器化部署（每账号一容器）

```yaml
# 每个 XHS 账号 = 一个 docker 实例
xhs-mcp-account-${ACCOUNT_ID}:
  image: xpzouying/xiaohongshu-mcp:latest
  environment:
    - XHS_PROXY=${PROXY_URL_FOR_ACCOUNT}     # 每账号独立住宅 IP
  volumes:
    - cookies-${ACCOUNT_ID}:/app/cookies     # 独立 cookie 卷
    - assets-${ACCOUNT_ID}:/app/assets       # 待发布图片
  networks:
    - redmatrix-internal
  labels:
    - "redmatrix.account_id=${ACCOUNT_ID}"
```

- 5 个账号 ≈ 5 个轻量容器（每个 ~150MB RAM 闲置，活跃时 ~400MB）
- 4C8G 服务器可跑 10~15 个并发账号
- 启停由我们的 NestJS 通过 Docker API 控制

### 2.2 在 NestJS 中加 automation 模块

```ts
// 新增 src/automation/automation.service.ts 骨架
class AutomationService {
  async getOrCreateWorker(accountId: bigint): Promise<WorkerHandle> {
    // 查 XhsSession，如果没活跃 worker → docker run；返回 baseUrl
  }
  
  async loginQrcode(accountId: bigint): Promise<{ qrcodeUrl: string }> {
    const w = await this.getOrCreateWorker(accountId);
    return axios.get(`${w.baseUrl}/api/v1/login/qrcode`);
  }

  async publish(accountId: bigint, draftId: bigint): Promise<PublishResult> {
    const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
    // 1. 下载草稿图片到 assets-${accountId} 卷
    const localPaths = await this.materialize(draft.media);
    // 2. 调 worker /api/v1/publish
    const w = await this.getOrCreateWorker(accountId);
    return axios.post(`${w.baseUrl}/api/v1/publish`, {
      title: draft.title,
      content: draft.body,
      images: localPaths,
      tags: draft.hashtags,
    });
  }

  async postComment(accountId: bigint, feedId: string, content: string) {
    const w = await this.getOrCreateWorker(accountId);
    return axios.post(`${w.baseUrl}/api/v1/feeds/comment`, { feed_id: feedId, content });
  }

  // 评论/私信任务由 cron 拉取 + BullMQ 入队 + 按账号节流 + 调用 worker
}
```

### 2.3 BullMQ 任务编排

复用现有 `Job` 表 + Redis（已部署）：

```ts
// jobs:
//   imitate           — 已实现（同步流）
//   publish           — Phase 2
//   comment.sweep     — Phase 3（周期拉取自己笔记的评论，推到 RedMatrix）
//   comment.reply     — Phase 3（AI 生成回复 + 调用 worker）
//   dm.poll           — Phase 3（蓝 V 私信轮询）
//   dm.reply          — Phase 3
//   session.heartbeat — 每 30 分钟 worker 上 /login/status 保活
```

---

## 3. 风险与合规调整

| 维度 | 此前计划 | 集成后 |
|---|---|---|
| 自研 RPA 工作量 | 2~3 周 | 0（用 xpzouying 的） |
| 选择器维护风险 | 我们承担 | 跟随上游 + fork 备份 |
| 行为节流 | 自实现 | xiaohongshu-mcp 内置（鼠标/延迟/滚动）+ 我们外层日配额 |
| 多账号隔离 | Playwright context | **每账号独立 Docker 容器**（更彻底）|
| 法务边界 | 不变 | 必须强用户协议 + 用户实名 + 仅服务蓝 V/专业号 |

### 3.1 必须做的合规护栏

1. **开源致谢**：Web 页脚 + 关于页注明「基于 xpzouying/xiaohongshu-mcp（MIT）」+ 链接到他的捐赠页（他用赞赏做慈善）
2. **用户协议明文**：自动化能力使用风险由用户自担、用户保证账号合法授权
3. **强实名**：开通自动化前必须绑定手机 + 实名（接微信开放平台 OAuth）
4. **行为日配额硬限**：默认每账号每日发帖 ≤3、评论 ≤30、私信 ≤50、最小间隔 10 分钟
5. **紧急停机按钮**：用户面板「暂停全部自动化」一键熔断

---

## 4. 修订后的时间表

| 阶段 | 原计划 | 修订后 |
|---|---|---|
| Phase 1 仿写 | 3~5 天 | **已完成** ✅ |
| Phase 2 登录 + 发布 | 2~3 周 | **3~5 天**（集成 xhs-mcp）|
| Phase 3 评论 + 私信 | 2~3 周 | **1~2 周**（xhs-mcp 已提供 comment 接口）|
| Phase 4 调度 + 代理池 + 协议 | 2 周 | **1 周** |
| **总计** | 7~10 周 | **3~5 周** |

---

## 5. Phase 2 启动路径（建议）

**第 1 天**：
- Fork xiaohongshu-mcp（防止上游 breaking change）
- 拉一个测试账号 + 一个住宅 IP 跑通：docker run → 扫码登录 → /api/v1/publish 发一条手动准备的图文
- 验证 5 项关键操作：登录态查询、发布、评论、详情、搜索

**第 2 天**：
- 在 NestJS 加 `automation/` 模块（worker 路由 + 健康检查 + 图片下载到本地卷）
- 在 web 加「绑定 XHS 账号」按钮 → 调后端 → 显示 QR → 轮询登录态

**第 3 天**：
- 改造草稿编辑页：handoff 按钮变成「自动发布（高级）/ 跳 creator.xhs（普通）」二选一
- 接入 BullMQ + 实现 publish job worker
- 节流（每账号日配额 + 最小间隔）

**第 4~5 天**：
- 全链路测试：草稿 → 自动发布 → 回写 noteUrl
- 错误恢复：发布失败的重试 + 验证码弹窗的告警
- 第一个真实账号灰度

---

## 6. 商业策略调整

由于自研周期被压缩，我们可以更激进：

- **个人 Pro ¥99 / 月** — 含 1 账号自动化（每日 3 帖）
- **团队 Starter ¥499 / 月** — 5 账号自动化（含 1 个住宅 IP 池位）
- **团队 Pro ¥1,499 / 月** — 20 账号 + 4 IP + 评论自动化
- 第一批种子客户免费内测 2 个月，换 case study + 推荐

aredink 自己也是基于这个开源做的商业版（X-MCP 是他们的浏览器插件版）。我们的差异化：
- **完整工作台**（aredink 偏 API/MCP，缺图形界面 + 团队协作）
- **AI 仿写 + 协作 + 自动化** 三合一
- **专攻蓝 V 客户**（运营商/品牌/商家）

---

## 7. 待你决策

1. ⚠️ **采用 xiaohongshu-mcp 还是自研 Playwright 重写？**
   - 我推荐：采用，理由见上
   - 如果有强自研倾向（防止上游断供 / 想用 TypeScript 统一），我们 fork 后渐进迁移到 Playwright

2. ⚠️ **部署形态：每账号 Docker 容器 vs 单一进程多账号？**
   - 推荐：每账号容器（彻底隔离 + 一键启停 + 风控信号分离）
   - 备选：fork 后改造为单进程多账号（成本低但风险大）

3. ⚠️ **代理 IP 服务商签谁？**
   - 青果 / 巨量 / Bright Data —— 你倾向哪家？

4. ⚠️ **第一个测试账号谁来提供？**
   - 强烈建议是已养号 ≥30 天 + 粉丝 ≥1k 的蓝 V，不要拿干净新号试

我可以现在就开始：
- A. 加 automation 模块骨架（NestJS 端路由 + Job 表使用 + UI 入口）
- B. 写 Phase 2 部署脚本（docker-compose 模板 + worker 注册流程）
- C. 等你决策完再动
