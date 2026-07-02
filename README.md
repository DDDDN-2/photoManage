# AI 图片素材库 Web MVP

这是根据 `agents.md` 落地的网页端原型。当前版本包含静态前端和轻量 Node 后端，后端可调用阿里云百炼 `qwen-vl-plus` 视觉模型完成图片识别、标签生成和项目推荐。

## 本地启动

先复制环境变量模板，并填入百炼 API Key：

```bash
cp .env.example .env
```

`.env` 至少需要：

```text
DASHSCOPE_API_KEY=你的百炼APIKey
QWEN_VISION_MODEL=qwen-vl-plus
QWEN_CLASSIFIER_MODEL=qwen-plus
```

启动：

```bash
node server.js
```

服务默认监听：

```text
http://localhost:3000
http://本机局域网IP:3000
```

如需改端口：

```bash
PORT=8080 node server.js
```

如需限制只允许本机访问：

```bash
HOST=127.0.0.1 node server.js
```

如果没有配置 `DASHSCOPE_API_KEY`，页面仍可上传图片，但后端会返回识别失败，素材会保留并进入待确认状态。

## Qwen 视觉识别链路

上传图片后的真实识别流程：

```text
前端读取图片为 data URL
  -> POST /api/analyze-image
  -> Node 后端调用 qwen-vl-plus 识别图片内容
  -> Node 后端调用 qwen-plus 判断应该放入哪个画布类别
  -> 返回 title / description / tags / visual_features / canvas_column_id / recommended_project_id / confidence / reason
  -> 前端更新素材卡片和项目归档状态
```

后端接口：

```text
POST /api/analyze-image
```

## 后端状态持久化

当前版本新增轻量后端状态接口，不需要先接数据库：

```text
GET /api/state
PUT /api/state
GET /api/health
```

运行时数据会保存到本机：

```text
data/state.json
```

`data/` 已加入 `.gitignore`，不会上传到 GitHub。前端启动时会先用浏览器本地数据快速渲染，然后从 `/api/state` 拉取后端状态；每次项目、素材、画布位置变化后，会自动防抖保存到后端。

如果前端和后端分离部署，可以在浏览器控制台设置后端地址：

```js
localStorage.setItem("photoManage.apiBaseUrl", "https://你的后端域名")
```

## 外网访问

当前线上地址：

```text
https://photo-manage.dn2king666.workers.dev/
```

前端静态文件可以直接部署到 Cloudflare Pages：

```text
Build command: 留空
Build output directory: dist
```

部署后会获得类似这样的 HTTPS 地址：

```text
https://your-app.pages.dev
```

如果只想临时把本机服务暴露到公网，可以在本机装好 `cloudflared` 后运行：

```bash
cloudflared tunnel --url http://localhost:3000
```

本机已经验证过 quick tunnel 模式，可以通过 Cloudflare 生成的 `trycloudflare.com` 临时地址访问。注意 quick tunnel 地址每次重启可能变化，适合测试；正式长期访问建议创建 Cloudflare named tunnel 并绑定自己的域名。

本项目已准备好干净的 Cloudflare Pages 发布目录和压缩包：

```text
dist/
photoManage-cloudflare-pages.zip
```

`dist/` 只包含公网需要的文件：

```text
index.html
styles.css
app.js
_headers
```

Cloudflare Pages 直接上传时，优先上传 `dist/` 文件夹；如果网页端需要压缩包，则上传 `photoManage-cloudflare-pages.zip`。

## 复制图片到即梦 AI

素材卡片里有「复制图片」按钮。点击后会把图片按 PNG 写入剪贴板，随后可以在即梦 AI 网页端的输入区直接粘贴。

注意：

- 复制图片需要在 `localhost` 或 HTTPS 域名下使用。
- Cloudflare Pages 提供 HTTPS，适合这个功能。
- 通过 `http://局域网IP:3000` 访问时，浏览器不允许网页写入图片剪贴板；页面会自动降级下载 PNG。
- 如果浏览器不支持图片剪贴板，页面会降级复制图片数据链接或下载 PNG。

正式上线时建议组合：

```text
前端：Cloudflare Pages
图片存储：Cloudflare R2 / S3 / OSS
后端 API：Railway / Render / Fly.io / 云服务器
数据库：Supabase Postgres / Neon / PostgreSQL + pgvector
队列：Upstash Redis / 云 Redis
AI Worker：和 API 同部署或单独部署
```

## 已实现页面能力

- 图片拖拽和多图上传
- 新建项目，并自动生成基础项目画像
- 概览展示用户行动指标：待确认、已确认、可快速确认
- 上传区旁展示归档任务，点击任务项可直接筛选素材
- 点击具体项目进入项目自由画布，素材可自由摆放、点击缩放和平移
- 项目画布支持分组区域、便签、重置布局和自动保存
- 项目画布支持适配视图、一键整理素材、小地图导航和分组缩放
- 画布内素材卡支持直接复制图片或移入待确认
- 项目画布视图隐藏右侧项目画像，画布单列铺满主区域
- 上传后调用 Qwen 视觉模型完成 AI 识别
- 自动生成标题、描述、标签、推荐项目、置信度和推荐理由
- 根据置信度进入「待快速确认」「可能相关」「待确认」
- 用户确认项目、修改项目或移入待确认
- 确认前必须选择非空项目；确认后隐藏确认按钮并显示已归档反馈
- 每张素材卡片右上角三点菜单支持修改归档和删除素材
- 每张素材卡片支持「复制图片」，方便复制后粘贴到即梦 AI 网页端
- 搜索标题、描述、标签、推荐理由和项目名
- 一键按标签查找相似素材
- 项目画像侧栏和用户反馈记录
- `localStorage` 保存当前前端数据

## 后续接真实服务

前端现在把所有数据集中在 `app.js` 的状态层里。接后端时，建议替换这些函数：

```text
handleFiles -> POST /api/analyze-image 或未来 POST /assets/upload
renderAssets/getVisibleAssets -> GET /assets 或 POST /search
confirmAsset -> POST /assets/:id/confirm-project
renderProfile -> GET /projects/:id/profile
createProject -> POST /projects
```

后端返回字段可以沿用 `agents.md` 中的 AI 输出 JSON，并映射到当前 asset 数据结构。
