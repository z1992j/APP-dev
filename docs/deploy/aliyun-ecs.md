# 阿里云 ECS 部署手册（最快路径）

> 目标：从「全新 ECS」到「能登录的网页 URL」≤ 10 分钟。

## 0. 准备 3 样东西

| 东西 | 在哪拿 |
|---|---|
| **ECS 公网 IP** | 阿里云控制台 → 实例 → 公网 IP |
| **SSH 密码 / 密钥** | 重置或在购买时设置 |
| **DeepSeek API Key** | https://platform.deepseek.com/api_keys |

域名 / ICP 备案 **不要**先搞 —— 国内备案 20 个工作日，我们先用 IP+端口测试，跑通后再补域名。

## 1. 阿里云安全组：开 3000 + 3001 端口

控制台 → ECS 实例 → 「**防火墙 / 安全组**」 → 添加规则：

| 协议 | 端口 | 授权对象 | 说明 |
|---|---|---|---|
| TCP | 3000 | 0.0.0.0/0 | NestJS API |
| TCP | 3001 | 0.0.0.0/0 | Next.js Web |
| TCP | 22 | 0.0.0.0/0 | SSH（默认有）|

⚠️ 不开就外网访问不了，本地 ssh 进去能 curl 通也没用。

## 2. SSH 进去 → 一行命令部署

```bash
ssh root@<你的ECS公网IP>

# 一行命令拉脚本 + 跑
curl -fsSL https://raw.githubusercontent.com/z1992j/APP-dev/main/deploy/aliyun-deploy.sh \
  | bash -s -- --deepseek-key sk-你的key
```

脚本会自动：

1. 装 Docker（走阿里云镜像加速）
2. 配 daemon mirror（拉镜像更快）
3. 检测内存：≥ 3GB 启 xhs-mcp worker，< 3GB 跳过
4. 探测公网 IP
5. 克隆代码到 `~/redmatrix`
6. 生成 `deploy/.env`（JWT/Postgres 密码随机生成）
7. 本机 docker build 镜像（首次 ~5 分钟，之后增量）
8. 起 postgres + redis + server + web
9. 拉 xhs-mcp 镜像（≥ 3GB 内存时）
10. 等健康检查 → 打印登录 URL

**预期产出**：

```
🚀 RedMatrix 部署完成！

  登录页：  http://<你的IP>:3001/login
  健康检查：http://<你的IP>:3000/api/v1/health
  Dev 登录：填任意标识（如 alice）即可
```

## 3. 测试

打开 `http://<ECS_IP>:3001/login`：

1. 填 `alice` → 进工作台
2. **账号档案** → 新建一个，赛道选「穿搭」
3. **AI 写作** → 主题「春日通勤」→ 点生成 → 看 DeepSeek 流式输出
4. **一键仿写** → 粘贴一条 xiaohongshu.com 链接 → 解析 → 生成
5. **违禁词** → 在草稿里写「全网最低」「保本」试触发

## 4. 常见问题

### Q: `curl http://<IP>:3001/login` 在 ECS 上能通，外网不通

→ 阿里云安全组没开 3001（见 Step 1）

### Q: AI 写作返回「生成失败，请重试」

→ DeepSeek API Key 没填或不对。编辑 `~/redmatrix/deploy/.env` 改 `DEEPSEEK_API_KEY=`，然后：
```bash
cd ~/redmatrix/deploy
docker compose -f docker-compose.prod.yml --env-file .env restart server
```

### Q: 内存不够（轻量服务器 1C2G）

→ xhs-mcp 自动化不会启（需 ≥ 4GB），但 AI 写作 / 仿写 / 草稿 / 评论列表都能用。
→ 升级到 2C4G 后重跑一次部署脚本即可。

### Q: 怎么更新到最新代码

```bash
cd ~/redmatrix && git pull
bash deploy/aliyun-deploy.sh --deepseek-key sk-xxx --skip-deps
```

### Q: 怎么停

```bash
cd ~/redmatrix/deploy
docker compose -f docker-compose.prod.yml --env-file .env down
```

## 5. 升级到域名 + HTTPS（备案完成后）

1. 域名解析 A 记录指向 ECS 公网 IP
2. 安全组开 80 + 443
3. 装 Nginx + Certbot：

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp ~/redmatrix/deploy/nginx/redmatrix.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/redmatrix.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d app.your-domain.com -d api.your-domain.com
sudo systemctl restart nginx
```

4. 更新 `deploy/.env` 的 `PUBLIC_API_BASE=https://api.your-domain.com`
5. 重启 server + web

## 6. GHCR 拉镜像版本（替代源码构建）

如果你想跳过本机构建（CI 已经构建好镜像在 ghcr.io）：

```bash
# 在 GitHub → Settings → Developer settings → Personal access tokens
# → Generate new token (classic) → 勾 read:packages
# 假设拿到的 token = ghp_xxx

bash deploy/aliyun-deploy.sh \
  --deepseek-key sk-xxx \
  --mode ghcr \
  --gh-token ghp_xxx
```

## 7. 监控 / 日志

```bash
cd ~/redmatrix/deploy

# 看实时日志
docker compose -f docker-compose.prod.yml --env-file .env logs -f server
docker compose -f docker-compose.prod.yml --env-file .env logs -f web

# 容器状态
docker compose -f docker-compose.prod.yml --env-file .env ps

# 进数据库
docker compose -f docker-compose.prod.yml --env-file .env exec postgres \
  psql -U redmatrix -d redmatrix
```

## 8. 风险提示

- xhs-mcp 自动化属灰区，**先用真实蓝 V 测试账号**，**不要拿主号试**
- 每账号每日发帖默认 ≤ 3，间隔 30 分钟（在 `xhs_session.dailyQuota` JSON 里调）
- ECS 公网 IP 暴露 :3000 :3001 没有 HTTPS / 鉴权门槛，**测试结束尽快换内网或加 Nginx + Basic Auth**
