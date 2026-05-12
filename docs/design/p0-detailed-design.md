# 小红书矩阵协作小程序 — P0 详细设计

> 接续 `docs/research/xiaohongshu-matrix-manager.md`。
> 目标：把第 1~6 周的 P0 范围落到可开发粒度（页面、字段、API、SQL、prompt、跳转协议）。
> 路线已定：协作中台路线 A，**发布动作交还给用户在小红书 App 内完成**。

---

## 1. 信息架构

### 1.1 顶层导航（小程序底部 4 Tab）

```
┌──────────┬──────────┬──────────┬──────────┐
│  灵感     │  我的草稿 │   数据    │   我      │
│  (选题)   │  (排期)   │  (看板)   │  (账号)   │
└──────────┴──────────┴──────────┴──────────┘
```

- **灵感**：选题搜索 + AI 写作入口（高频钩子，承担拉新与日活）
- **我的草稿**：草稿列表 + 日历视图 + 状态流转（核心创作工作流）
- **数据**：单账号/全矩阵看板 + 每日填报小卡片
- **我**：账号档案、团队、订阅、设置、协议

P0 不做"团队协作 / 审稿 / 任务"独立 Tab，先内嵌到草稿详情；P1 再独立。

### 1.2 主要页面清单（21 个）

| 模块 | 页面 | 路径建议 |
|---|---|---|
| 灵感 | 灵感首页（推荐 + 搜索） | `/pages/inspire/index` |
|  | 搜索结果页 | `/pages/inspire/search` |
|  | 笔记参考详情 | `/pages/inspire/note` |
|  | AI 写作工作台 | `/pages/inspire/write` |
| 草稿 | 草稿列表 | `/pages/draft/list` |
|  | 草稿编辑器（图文） | `/pages/draft/edit` |
|  | 草稿编辑器（视频） | `/pages/draft/edit-video` |
|  | 违禁词检查面板 | `/pages/draft/lint` |
|  | 发布前预览 | `/pages/draft/preview` |
|  | 跳转小红书指引页 | `/pages/draft/handoff` |
|  | 日历视图 | `/pages/draft/calendar` |
| 数据 | 数据首页（汇总） | `/pages/data/index` |
|  | 单账号详情 | `/pages/data/account` |
|  | 单笔记详情 | `/pages/data/note` |
|  | 今日填报弹层 | `/pages/data/report` |
| 我 | 个人主页 | `/pages/me/index` |
|  | 账号档案列表 | `/pages/me/accounts` |
|  | 账号档案编辑 | `/pages/me/account-edit` |
|  | 订阅与计费 | `/pages/me/billing` |
|  | 设置 | `/pages/me/settings` |
|  | 协议中心 | `/pages/me/agreements` |

---

## 2. P0 五大功能详设

### 2.1 选题灵感库

**用户故事**
- 作为博主，我想输入关键词找到近 7/30 天的爆文，作为我自己选题的参考。
- 作为运营，我想按"行业+受众+时间"组合筛选爆文，沉淀到自己的选题池。

**主流程**
1. 输入关键词 → 调用后端 `/inspire/search`
2. 后端从数据源（一期 = 千瓜/新红 API 转售；二期 = 自家用户填报 + 公开页解析）拉笔记列表
3. 列表卡片：封面、标题（高亮关键词）、互动数（💗/⭐/💬）、博主、行业 Tag、发布时间
4. 点卡片 → 详情页：完整正文摘要、首图、互动趋势（可选）、"加入选题池"、"用这条写作"

**核心字段**

```ts
type InspireNote = {
  id: string;            // 数据源唯一 id
  source: 'qiangua' | 'xinhong' | 'user' | 'oembed';
  cover_url: string;
  title: string;
  body_excerpt: string;  // <=200 字摘要；版权敏感，不存全文
  author: {
    nickname: string;
    follower_range: string;  // 万级桶化
  };
  metrics: {
    likes: number;
    saves: number;
    comments: number;
    published_at: string;
  };
  vertical: string;       // 穿搭/美妆/...
  tags: string[];
  permalink: string;      // 跳 XHS 笔记的 URL
};
```

**边界**
- **不存全文正文**，只存摘要 + 链接，规避版权与采集风险。
- 数据源 API 失败时回退到"输入笔记链接 → oembed 解析"的小工具，保证页面不空。
- 搜索频次：免费用户 10 次/天；个人 Pro 100 次/天；团队不限。

---

### 2.2 AI 写作工作台

**用户故事**
- 作为博主，我想根据"主题 + 人设 + 风格"生成标题与正文，并能选词改写。
- 作为运营，我想把同一篇正文按 5 个人设各生成一版，分发给矩阵内不同博主。

**主流程**
1. 用户在编辑器顶部填：主题、目标账号（选择一个或多个账号档案）、风格（"种草/干货/吐槽/故事"）、字数档位（80/200/500/1000）。
2. 可选挂载灵感笔记 ID（作为参考但不抄袭）。
3. 点"生成" → 流式返回标题候选 ×5 + 正文 ×1。
4. 用户可选"换一批""保留这条改写""一键润色""加 emoji""加 hashtag"。
5. 通过后写入草稿。

**核心 prompt 资产**（系统提示词模板，按垂类切换）

```
你是一位资深小红书内容编辑，专做{vertical}赛道。
请根据下列要求产出符合小红书风格的标题与正文。

【账号人设】
{persona_block}    // 从账号档案注入

【主题】
{topic}

【风格】
{style}   // 种草/干货/吐槽/故事/clickbait

【字数】
正文 {word_count} 字 ± 20%

【硬性要求】
1. 标题 ≤20 字，必带 1~2 个 emoji，避免极限词。
2. 正文分 3~5 段，每段开头加 emoji 或符号。
3. 自然嵌入 3~6 个 hashtag 在正文末尾。
4. 不出现医疗疗效断言、极限词、敏感品类。
5. 输出 JSON：{"titles":[...5...], "body":"...", "hashtags":[...]}

【可选参考】
{ref_note_excerpt}    // 来自灵感笔记的摘要，仅做风格参考不抄
```

**多供应商路由**
- 默认 Claude 4.7；高负载或敏感品类（医美/金融）回退 Qwen-Max。
- 开启 prompt caching：`persona_block`（账号人设）+ 风格模板 + 行业知识做缓存块；只有 `topic` 与 `ref_note_excerpt` 是非缓存的动态部分。
- 流式返回（SSE 或 WebSocket）。

**改写工具调用**（局部）
- 选中文本 → 弹"改写/扩写/缩写/换风格/加 emoji" → 调 `/ai/rewrite` 带 `selection` + `instruction`。

**计量**
- 按 token 计；客户端不算钱，服务端落账 `AIUsage`；超免费配额后调用前置检查。

---

### 2.3 违禁词 / 极限词 / 平台风险检测

**用户故事**
- 作为博主，发布前我想一键扫描文案，避免被限流或处罚。

**主流程**
1. 编辑器底部"检查"按钮 → 调 `/lint`。
2. 后端三层检测：
   - L1 自有词库（极限词、违禁词、医疗疗效、广告法）→ 标黄/标红
   - L2 微信内容安全 API `msgSecCheck` → 阻断红线词
   - L3 LLM 上下文判断（"看起来在做医疗效果暗示吗？"）→ 给改写建议
3. 返回 `{ violations: [{text, span, level, category, suggestion}], passed: bool }`。
4. 客户端在文本上画下划线 + 长按弹改写建议。

**词库设计**
- 三张表：`lint_word` (term, category, level, action)、`lint_phrase`（含正则）、`lint_pattern`（LLM 规则）。
- 后台可热更新；版本号 + 客户端缓存 24h，新版本上线触发强制刷新。

**性能**
- L1 走 Trie，平均 <5ms；L2 接微信安全 API 200~500ms；L3 仅在 L1/L2 通过后异步触发。

---

### 2.4 草稿与排期

**用户故事**
- 作为博主，我想保存多个草稿，按日历排期，按状态过滤。
- 作为运营，我想看到矩阵内每个账号本周的发布计划。

**草稿状态机**

```
[draft] ─→ [in_review] ─→ [approved] ─→ [scheduled] ─→ [handed_off] ─→ [published] ─→ [archived]
   ↑           ↓
   └─── rejected
```

- P0 不做协作时，`in_review` / `approved` 可跳过；用户单飞直接 `draft → scheduled → handed_off → published`。
- `handed_off`：用户点了"打开小红书发布"按钮的标记，等待用户回填发布结果。
- `published`：用户回填了 XHS 笔记链接，服务端解析回写元数据。

**编辑器组件**
- 文本编辑：富文本不必，纯文本 + emoji 选择器即可（XHS 不识别 Markdown）。
- 图片：最多 18 张，单张 ≤10MB，客户端压缩到 webp，上传 COS；支持拖拽排序、裁剪、加水印、贴纸。
- 视频：单段，≤500MB，分片上传，服务端 ffmpeg 转 HLS（仅用于本应用预览）；用户最终上传到 XHS 的还是原片。
- Hashtag：自动从正文中提取 + 推荐。

**排期触发**
- `schedule_at` 到时间 → 服务端推订阅消息"该发布啦"。
- **重要**：订阅消息一次授权只能推一次，要在用户首次创建排期时申请；推完一条再申请下一条，UI 上做"开启重复提醒"。

---

### 2.5 数据看板 + 每日填报

**用户故事**
- 作为博主，我想每天用 30 秒填一次 4 个数字（粉丝/曝光/互动/今日发布数），自动生成趋势。
- 作为运营，我想看矩阵汇总。

**数据来源优先级**
1. 用户主动填报（最准、合规、零成本）。
2. 用户粘贴 XHS 笔记链接 → 后端 oembed/meta 解析（互动数延迟约 1 天）。
3. 千瓜/新红 API（覆盖头部账号，长尾覆盖差）。
4. 创作者后台 CSV 导出上传（P1）。

**填报触发**
- 每天 21:00 推订阅消息"今日填报"。
- 进入小程序首屏弹 modal（每日一次）。
- 填报字段：粉丝总数、当日新增曝光、当日新增点赞/收藏/评论、当日发布数、当日私信数。

**看板视图**
- 单账号：折线（粉丝/曝光/互动率，可切换 7d/30d/90d）+ 笔记列表 + 爆款识别（互动率 > 账号均值 2σ）。
- 矩阵汇总：账号卡片网格 + 全矩阵总曝光/总粉丝/总互动 + Top 5 爆款笔记。

**导出**
- 周报、月报 PDF/PNG，水印含账号档案名。

---

## 3. 数据库 DDL（PostgreSQL）

> 命名风格：snake_case；所有表带 `id BIGSERIAL`、`created_at`、`updated_at`、`deleted_at`。
> 团队与多租户：`team_id` 几乎在每张业务表上做强隔离 + 索引。

```sql
-- 用户与团队 --------------------------------------------------------------
CREATE TABLE app_user (
  id            BIGSERIAL PRIMARY KEY,
  openid        TEXT UNIQUE NOT NULL,
  unionid       TEXT,
  phone         TEXT,
  nickname      TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_id      BIGINT REFERENCES app_user(id),
  plan          TEXT NOT NULL DEFAULT 'free',  -- free|personal|starter|pro|enterprise
  seats         INT NOT NULL DEFAULT 1,
  current_period_end TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_member (
  team_id       BIGINT REFERENCES team(id),
  user_id       BIGINT REFERENCES app_user(id),
  role          TEXT NOT NULL,  -- owner|admin|editor|reviewer|viewer
  joined_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- 账号档案 ----------------------------------------------------------------
CREATE TABLE xhs_account (
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT NOT NULL REFERENCES team(id),
  nickname      TEXT NOT NULL,
  xhs_url       TEXT,                    -- 小红书主页链接（可空）
  vertical      TEXT,                    -- 穿搭/美妆/...
  persona       JSONB NOT NULL DEFAULT '{}',  -- 人设：性别、年龄、风格、口头禅、禁词偏好
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_xhs_account_team ON xhs_account(team_id);

-- 草稿与排期 --------------------------------------------------------------
CREATE TABLE draft (
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT NOT NULL REFERENCES team(id),
  account_id    BIGINT REFERENCES xhs_account(id),
  author_id     BIGINT REFERENCES app_user(id),
  kind          TEXT NOT NULL,           -- image|video
  title         TEXT,
  body          TEXT,
  media         JSONB NOT NULL DEFAULT '[]', -- [{url, w, h, type, order}]
  hashtags      TEXT[] DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'draft',
  schedule_at   TIMESTAMPTZ,
  handed_off_at TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  published_url TEXT,                    -- 用户回填的 XHS 笔记链接
  ai_meta       JSONB DEFAULT '{}',      -- 用了哪个模型/token 数
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_draft_team_status ON draft(team_id, status);
CREATE INDEX idx_draft_account ON draft(account_id);
CREATE INDEX idx_draft_schedule ON draft(schedule_at) WHERE status = 'scheduled';

-- 草稿评审（P0 可建表不开放 UI） ------------------------------------------
CREATE TABLE draft_review (
  id            BIGSERIAL PRIMARY KEY,
  draft_id      BIGINT REFERENCES draft(id),
  reviewer_id   BIGINT REFERENCES app_user(id),
  decision      TEXT NOT NULL,           -- approve|reject|comment
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 灵感笔记缓存 ------------------------------------------------------------
CREATE TABLE inspire_note (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  fingerprint   TEXT UNIQUE NOT NULL,   -- sha1(source || source_id)
  payload       JSONB NOT NULL,          -- 含 cover/title/excerpt/metrics/vertical/tags
  vertical      TEXT,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ              -- 缓存过期
);
CREATE INDEX idx_inspire_vertical ON inspire_note(vertical);
CREATE INDEX idx_inspire_fetched ON inspire_note(fetched_at);

CREATE TABLE inspire_pool (              -- 用户的"选题池"
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT REFERENCES team(id),
  user_id       BIGINT REFERENCES app_user(id),
  note_fp       TEXT REFERENCES inspire_note(fingerprint),
  note_snapshot JSONB,                   -- 防止 inspire_note 过期
  added_at      TIMESTAMPTZ DEFAULT now()
);

-- 违禁词 ------------------------------------------------------------------
CREATE TABLE lint_word (
  id            BIGSERIAL PRIMARY KEY,
  term          TEXT NOT NULL,
  pattern_type  TEXT NOT NULL,            -- exact|regex|llm
  category      TEXT NOT NULL,            -- 极限词|医疗|金融|低俗|平台风险|...
  level         TEXT NOT NULL,            -- red|yellow|info
  suggestion    TEXT,                     -- 建议改写
  enabled       BOOLEAN DEFAULT true,
  version       INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lint_enabled ON lint_word(enabled);

-- 数据点 ------------------------------------------------------------------
CREATE TABLE data_point (
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT REFERENCES team(id),
  account_id    BIGINT REFERENCES xhs_account(id),
  draft_id      BIGINT REFERENCES draft(id),
  bucket_date   DATE NOT NULL,
  source        TEXT NOT NULL,            -- user|oembed|qiangua|xinhong|csv
  metrics       JSONB NOT NULL,           -- {followers, impressions, likes, saves, comments, msgs, posts}
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX uk_data_point ON data_point(account_id, bucket_date, source);
CREATE INDEX idx_data_point_team ON data_point(team_id, bucket_date);

-- AI 用量 ----------------------------------------------------------------
CREATE TABLE ai_usage (
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT,
  user_id       BIGINT,
  kind          TEXT,                     -- write|rewrite|lint_llm|inspire
  provider      TEXT,                     -- claude|gpt|qwen
  model         TEXT,
  prompt_tokens INT,
  cached_tokens INT,
  output_tokens INT,
  cost_cents    INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ai_usage_team_day ON ai_usage(team_id, created_at);

-- 订阅消息（追踪一次性消息授权配额） --------------------------------------
CREATE TABLE subscribe_token (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES app_user(id),
  template_id   TEXT NOT NULL,            -- 微信侧模板 id
  consumed_at   TIMESTAMPTZ,              -- null = 可用
  granted_at    TIMESTAMPTZ DEFAULT now(),
  consumed_for  JSONB                     -- {draft_id?, report_date?}
);
CREATE INDEX idx_subscribe_avail ON subscribe_token(user_id, template_id) WHERE consumed_at IS NULL;

-- 审计日志 ---------------------------------------------------------------
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  team_id       BIGINT,
  actor_id      BIGINT,
  action        TEXT NOT NULL,            -- draft.create|draft.edit|draft.handoff|...
  target_type   TEXT,
  target_id     BIGINT,
  meta          JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_team_time ON audit_log(team_id, created_at);
```

**索引策略要点**
- 所有 list 接口都走 `(team_id, status, schedule_at DESC)` 之类组合索引。
- `inspire_note` 按 `fetched_at` 老化清理，保留 30 天。
- `data_point` 按 `bucket_date` 做月度分区（pg_partman），单表行数控制。

---

## 4. API 契约（关键端点）

> 一致风格：`/api/v1/{module}/{action}`；JSON；Bearer JWT；错误 `{code, message, hint?}`；分页 `?cursor=&limit=`。

```
Auth
  POST /auth/wx-login              { code } → { token, user, team_ctx }
  POST /auth/refresh               { refresh } → { token }
  POST /auth/bind-phone            { code } → { user }

Account profiles
  GET  /accounts                   → [XhsAccount]
  POST /accounts                   { nickname, vertical, persona, xhs_url? } → XhsAccount
  PUT  /accounts/:id
  DELETE /accounts/:id

Inspire
  GET  /inspire/search             ?q=&vertical=&days=7&cursor= → { items, cursor }
  GET  /inspire/note/:fp           → InspireNote
  POST /inspire/pool               { note_fp } → { ok }
  POST /inspire/oembed             { url } → InspireNote   // 用户粘链兜底

AI
  POST /ai/write    (SSE)          { topic, account_id, style, words, ref_note_fp? }
                                   → stream { titles[], body, hashtags[] }
  POST /ai/rewrite  (SSE)          { text, instruction, account_id? }
                                   → stream { text }

Lint
  POST /lint                       { text } → { violations[], passed }
  GET  /lint/version               → { version, etag }
  GET  /lint/dict?since=v          → { adds[], removes[], version }

Drafts
  GET  /drafts                     ?status=&account_id=&from=&to=&cursor=
  POST /drafts                     { ...Draft }
  GET  /drafts/:id
  PUT  /drafts/:id
  POST /drafts/:id/schedule        { schedule_at } → { ok }
  POST /drafts/:id/handoff         → { ok, handoff_token }   // 标记进入 handed_off
  POST /drafts/:id/published       { published_url } → { ok }
  POST /drafts/:id/review          { decision, comment? }

Media
  POST /media/sign                 { kind, ext, size } → { upload_url, key, ttl }
  POST /media/finalize             { key, w?, h?, duration? }

Data
  POST /data/report                { account_id, bucket_date, metrics } → { ok }
  GET  /data/account/:id           ?from=&to=&granularity=day → { series, top_notes }
  GET  /data/team                  ?from=&to= → { totals, accounts[] }
  POST /data/note-resolve          { url } → DataPoint        // 粘链兜底解析

Notify
  POST /notify/grant-token         { template_id } → { ok }    // 写入授权
  POST /notify/test                { user_id, template_id }    // 联调用

Audit (admin)
  GET  /audit                      ?team_id=&from=&to=

Billing
  GET  /plans
  POST /billing/order              { plan, period } → { prepay_id }
  POST /billing/notify             // 微信支付回调
```

**速率限制**
- `/inspire/search`: free 10/d, personal 100/d, team 不限。
- `/ai/write`: free 3/d, personal 100/d, team 1000/d，超额按 0.05 元/千 token 累加。
- `/lint`: 100/min/user。
- 全局：单 IP 600 req/min。

**错误码约定**
- `40001` token 过期；`40301` 权限不足；`40901` 配额耗尽；`42201` 内容安全拦截（含具体命中词）；`50301` 上游 AI 失败（带 fallback hint）。

---

## 5. AI Prompt 资产

### 5.1 系统 prompt 模板（写作）

参见 §2.2，关键设计：
- **缓存层**：vertical knowledge block + persona block + style block 用 `cache_control` 标记为 `ephemeral`，5 min TTL，命中后 90% 输入 token 不计费。
- **多账号一稿多发**：传 `account_ids[]`，服务端按数量 fan-out 生成 N 个版本，统一返回；每个版本里 persona block 不同。

### 5.2 灵感推荐（兜底文案）

当数据源命中为 0 时，调用 LLM 直接给"参考型选题清单"：

```
你是小红书选题策划，针对关键词 {q}，列 10 个值得做的角度。
每条 ≤30 字。输出 JSON: ["...", ...]
要求：避免敏感品类、避免与官方权威结论冲突。
```

### 5.3 违禁词上下文判断（L3）

```
判断下文是否包含"医疗疗效暗示 / 极限词 / 金融保本暗示 / 低俗"。
若有，输出 {risk: true, hits: [{quote, category, suggestion}]}；
若无，输出 {risk: false}。
文本：
"""
{text}
"""
仅输出 JSON。
```

### 5.4 局部改写

```
改写下面这段小红书正文，符合 {instruction}。
保留原意，长度不超过原文 1.2 倍，避免极限词。
原文：{selection}
仅输出改写后的文本。
```

---

## 6. 跳转小红书 — 具体实现与降级

### 6.1 期望路径（iOS / Android）

```
小程序"发布"按钮
   │
   ├─→ wx.saveImageToPhotosAlbum (批量保存图片到相册)
   │     失败：提示用户去【我】里授权"保存到相册"
   │
   ├─→ wx.setClipboardData (写入标题 + 正文 + hashtag)
   │
   └─→ wx.openLink("https://h.your.domain/handoff?d={draft_id}&sig=...")
         │
         自家 H5 中转页 (注册业务域名 + ICP)
         │
         ├─ iOS：<a id="x" href="xhsdiscover://hey_home_feed/?ref=our_app">
         │    页面 onload 自动 click → 触发 Universal Link → 唤起 XHS
         │
         └─ Android：intent:// 协议唤起 + scheme fallback
```

### 6.2 兼容性矩阵（按调研）

| XHS App 版本 | iOS 唤起 | Android 唤起 | 命中页 |
|---|---|---|---|
| ≥ 8.30 | ✅ Universal Link | ✅ intent:// | 发布选择页 |
| 8.0~8.29 | 🟡 部分版本需手动跳 App | ✅ scheme | App 首页 |
| < 8.0 | ❌ 失败 | ❌ 失败 | — |

**已确认的可用 scheme（社区收集，非官方文档）**：
- `xhsdiscover://hey_home_feed/` 图文/视频发布入口（"记录"）
- `xhsdiscover://hey_post/` 语音发布
- `xhsdiscover://home/` 首页
- `xhsdiscover://search/result?keyword=` 搜索

**未公开/不稳定**：直达"图文笔记发布编辑页"的 scheme 不稳定，可能要求一个 hack 的 path；P0 接受用户落到"发布选择页"再点一次"图文笔记"。

### 6.3 降级与引导

唤起失败时 H5 页降级显示：

```
✓ 图片已保存到相册
✓ 文案已复制到剪贴板
─────────────────────
[ 已安装小红书？点这里再试一次 ]
[ 没装？前往应用商店 ]
[ 看视频教程：如何粘贴发布 (15s) ]
```

H5 页埋点上报"唤起结果 / 用户最终选择"回服务端，作为兼容性矩阵优化输入。

### 6.4 回填发布结果

用户在 XHS App 发完，回到小程序：
- 草稿状态 = `handed_off`，列表卡片显示"待回填"按钮。
- 用户粘贴 XHS 笔记链接 → `/drafts/:id/published`。
- 服务端 oembed/meta 解析（含失败重试 + 异步队列），写回 `published_url` + 初始 metrics。

---

## 7. 错误与降级矩阵（高优）

| 场景 | 默认行为 | 降级 |
|---|---|---|
| 数据源 API 限流/挂了 | `/inspire/search` 返回缓存 + 触发 LLM 兜底清单 | 客户端标"实时数据暂不可用" |
| AI 主供应商 5xx | 失败重试 2 次 → 切备供应商 → 仍失败返回 50301 | 客户端 toast"换个角度再试" |
| 内容安全 API 拦截 | 草稿无法标记为 `scheduled` | 返回命中词 + 改写 CTA |
| 跳转 XHS 失败 | 显示"复制 + 保存 + 教程"卡片 | 提供"我已发布"按钮跳过 |
| 订阅消息额度耗尽 | 改用站内角标提醒 | 引导用户重新授权 |
| 视频分片中断 | 客户端续传 | >3 次失败提示降清晰度 |
| 图片 imgSecCheck 命中 | 拒绝该图 | 提示用户替换 |

---

## 8. 非功能性需求

| 指标 | 目标 |
|---|---|
| 冷启动 | <1.5s（首屏 LCP）|
| 接口 P95 | <500ms（非 AI），AI 流式 TTFB <1s |
| 可用性 | 月度 99.9% |
| 数据保留 | 草稿永久；inspire_note 缓存 30 天；audit 1 年；data_point 永久 |
| 备份 | PG 每日全量 + binlog 持续；COS 跨区复制 |
| 安全 | 全站 HTTPS；JWT + 刷新；接口 HMAC；敏感配置走 KMS |
| 合规 | 隐私协议 / 用户协议 / 第三方 SDK 清单 / 数据导出删除 |

---

## 9. 上线前 Checklist（第 6 周）

**资质**
- [ ] 企业小程序主体已认证
- [ ] ICP 备案完成（业务域名 + 接口域名）
- [ ] 类目选定：工具→效率 + 商业服务→企业服务，5 个槽位用满
- [ ] 隐私协议、用户协议、第三方 SDK 清单上线
- [ ] 内容安全 API（msgSecCheck/imgSecCheck）接入

**功能**
- [ ] 5 个 P0 功能可跑通 happy path
- [ ] 降级矩阵 7 个场景全部联调
- [ ] 跳转 XHS 在 iOS/Android 各 3 个机型 + XHS 三个版本验证
- [ ] AI 用量限额 + 计费打通
- [ ] 订阅消息模板申请通过（"今日填报""排期提醒"）

**数据**
- [ ] 数据源 BD 至少 1 家签约
- [ ] 违禁词词库初始版本入库（≥1500 条）

**埋点**
- [ ] 关键漏斗：注册 → 创建账号 → 写第一篇 → handoff → 回填发布
- [ ] AI 用量、跳转结果、订阅消息送达率

**法务**
- [ ] 个保法合规审（最小必要、可删除、可导出）
- [ ] AI 生成内容免责声明、违禁词检测免责声明

**运营**
- [ ] 内测用户群 50~100 人
- [ ] 客服渠道：公众号 + 站内反馈
- [ ] 价格灰度 A/B（29 vs 39 vs 49 元/月）

---

## 10. 下一步

立项后并行启动：

1. **第 0~1 周**：UI 设计稿（21 页）+ 数据源 BD。
2. **第 1~2 周**：后端骨架（auth/账号/草稿 CRUD）+ 小程序工程脚手架（Taro/原生）+ 词库初版。
3. **第 2~4 周**：5 个 P0 功能并行，AI 编排单独成模块。
4. **第 4~5 周**：跳转 XHS 真机矩阵验证 + 内容安全集成 + 审核包提交。
5. **第 5~6 周**：内测 + 数据闭环验证 + 灰度放量。

后续 P1（团队协作）与 P2（数据规模化）会在跑通 P0 关键转化漏斗后启动详设。
