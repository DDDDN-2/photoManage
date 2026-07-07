# AI 图片素材库长期版方案

## 产品目标

用户只负责上传图片。系统自动完成：

- 自动生成图片名称、描述、标签
- 自动识别图片主体、场景、风格、角色、用途
- 自动推荐归档项目，比如「噜噜嘟嘟」「赛博短片」「古风短剧」
- 支持自然语言搜索和相似图片搜索
- 低置信度素材进入「待确认项目」，用户确认后反哺项目画像

核心原则：不要求用户整理素材，只让用户确认 AI 的推荐是否正确。

## 推荐技术架构

```text
前端
  Web App: Next.js / React
  后续可扩展移动端、桌面端

后端
  API: FastAPI / NestJS
  Auth: Supabase Auth / Clerk / 自建 JWT
  Queue: Redis + BullMQ / Celery

数据层
  PostgreSQL: 用户、项目、素材、标签、任务状态
  Object Storage: S3 / Cloudflare R2 / 阿里云 OSS
  Vector DB: pgvector 起步，后期可换 Qdrant / Milvus

AI 层
  多模态识别 API: 图片理解、描述、标签、推荐理由
  Embedding API: 图片向量、文本向量、项目画像向量
```

## 上传处理流程

```text
用户上传图片
  -> 原图存对象存储
  -> 数据库创建 asset 记录
  -> 创建后台任务
  -> AI 识别图片内容
  -> 生成 title / description / tags
  -> 生成图片 embedding
  -> 和所有项目画像 embedding 比较
  -> 推荐项目 + 置信度 + 理由
  -> 写入数据库
  -> 前端显示结果
```

## 项目推荐逻辑

每个项目维护一个「项目画像」，由已确认素材自动生成：

```text
项目画像 =
  已确认图片向量的聚合
  + 项目关键词
  + 角色参考图
  + 场景参考图
  + 用户确认/纠错记录
```

推荐分数可以这样组合：

```text
final_score =
  图片向量相似度 * 0.55
  + AI 文本标签匹配 * 0.25
  + 文件名/上传来源线索 * 0.10
  + 用户历史确认偏好 * 0.10
```

推荐规则：

- `>= 0.85`：自动推荐到项目，等待用户快速确认
- `0.65 - 0.85`：推荐但标记为「可能相关」
- `< 0.65`：进入「待确认项目」

## 数据库核心表

```sql
users
- id
- email
- created_at

projects
- id
- user_id
- name
- description
- profile_text
- profile_embedding
- created_at
- updated_at

assets
- id
- user_id
- project_id
- recommended_project_id
- recommendation_score
- recommendation_reason
- file_url
- thumbnail_url
- title
- description
- status
- created_at

asset_tags
- id
- asset_id
- tag
- source -- ai / user

asset_embeddings
- asset_id
- embedding
- model

ai_jobs
- id
- asset_id
- type
- status
- error
- created_at
- completed_at

project_feedback
- id
- asset_id
- suggested_project_id
- final_project_id
- action -- accepted / changed / rejected
- created_at
```

## API 设计

```text
POST /assets/upload
上传图片，返回 asset_id 和处理状态

GET /assets
按项目、标签、搜索词、状态筛选素材

GET /assets/:id
获取单张素材详情

POST /assets/:id/confirm-project
确认或修改 AI 推荐项目

POST /search
自然语言搜索素材

POST /projects
创建项目

GET /projects/:id/profile
查看项目画像和推荐依据
```

## AI 输出格式

多模态识别 API 应返回结构化 JSON：

```json
{
  "title": "噜噜同IP小床",
  "description": "圆润3D体块、低饱和橙黄色、儿童向IP气质明显",
  "tags": ["噜噜嘟嘟", "同IP道具", "圆润线条", "3D软胶"],
  "visual_features": {
    "subject": "儿童向小床道具",
    "colors": ["橙黄", "奶白", "浅绿"],
    "style": "圆润3D软胶",
    "usage": "角色场景道具"
  },
  "recommended_project": "噜噜嘟嘟",
  "confidence": 0.92,
  "reason": "与噜噜嘟嘟项目已确认素材在配色、圆润比例和3D软胶质感上接近"
}
```

## 开发阶段

第一阶段：可用 MVP

- 用户登录
- 项目管理
- 图片上传
- 后台 AI 识别任务
- 自动标题、描述、标签
- 推荐项目
- 待确认项目
- 基础搜索

第二阶段：真正好用

- 向量搜索
- 相似图片
- 项目画像自动更新
- 用户确认/纠错反馈
- 批量上传
- 批量确认项目

第三阶段：长期资产库

- 多端同步
- 团队协作
- 分享链接
- 权限控制
- 版本历史
- 项目素材包导出

## 推荐起步方案

如果先做一个稳定但不复杂的版本：

```text
Next.js
PostgreSQL + pgvector
Cloudflare R2
Redis + BullMQ
一个多模态识别 API
一个 embedding API
```

起步时不需要单独部署 Qdrant/Milvus。图片量上来后，再把向量检索从 pgvector 迁移出去。

## 部署与域名/IP

开发 Web 端不需要先申请 IP。

本地开发：

```text
localhost:3000
```

适合开发上传、搜索、登录、项目推荐等功能。不要长期用 `file://` 打开页面，因为浏览器会限制剪贴板、上传、跨域请求等能力。

前端测试部署：

```text
Cloudflare Pages
```

Cloudflare Pages 可以免费托管前端页面，适合部署 Next.js/React 的 Web 端测试版。它会自动提供一个 HTTPS 访问地址，例如：

```text
https://your-app.pages.dev
```

优点：

- 免费额度适合早期项目
- 自动 HTTPS
- 不需要自己申请公网 IP
- 适合部署静态前端或轻量前端
- 后续可以绑定自己的域名

注意：

- Cloudflare Pages 主要负责前端
- 图片原文件建议放 Cloudflare R2 / S3 / 阿里云 OSS
- 数据库、队列、AI worker 通常需要单独部署
- 如果用 Next.js 的纯静态导出，Pages 很合适
- 如果大量依赖服务端渲染或长时间后台任务，需要配合独立 API/worker 服务

推荐部署组合：

```text
前端：Cloudflare Pages
图片存储：Cloudflare R2
后端 API：Railway / Render / Fly.io / 云服务器
数据库：Supabase Postgres / Neon / 自建 PostgreSQL
队列：Upstash Redis / 云 Redis / 自建 Redis
AI Worker：和 API 同部署，或单独 worker 服务
```

正式上线：

```text
自定义域名
HTTPS
对象存储
数据库备份
日志与监控
权限系统
```

如果服务器和域名解析用于中国大陆正式访问，通常需要考虑 ICP 备案。若部署在 Cloudflare Pages、香港、新加坡、日本、美国等境外服务，一般不需要大陆 ICP 备案，但国内访问速度和稳定性需要测试。

## 2026-06-17 开发上下文压缩

已根据本方案落地一个网页端 MVP，当前项目不依赖 npm 包，使用纯静态前端加 Node 静态服务，方便本地运行和 Cloudflare Pages 部署。

新增文件：

```text
index.html    页面结构：侧边项目、上传区、筛选区、素材卡片、项目画像侧栏
styles.css    工作台式响应式界面样式
app.js        前端状态、上传模拟 AI 识别、推荐项目、确认反馈、搜索和相似筛选
server.js     静态文件服务，默认监听 0.0.0.0:3000，支持局域网访问
README.md     启动、外网访问、Cloudflare Pages 部署和后端集成说明
package.json  仅包含 start 脚本，无第三方依赖
```

当前可运行能力：

- 多图拖拽上传和点击上传
- 上传后模拟后台 AI 识别任务
- 自动生成标题、描述、标签、推荐项目、置信度和推荐理由
- 按 `>=0.85`、`0.65-0.85`、`<0.65` 映射到待快速确认、可能相关、待确认
- 用户确认项目、改归档项目、移入待确认项目
- 支持在左侧新建项目，填写项目名、描述、关键词后自动生成基础项目画像
- 搜索标题、描述、标签、项目名和推荐理由
- 基于标签和推荐项目的一键相似素材筛选
- 项目画像侧栏和用户反馈记录
- 使用 `localStorage` 保存前端数据

启动方式：

```bash
node server.js
```

默认访问：

```text
http://localhost:3000
http://本机局域网IP:3000
```

公网访问建议：

```text
Cloudflare Pages
Build command: 留空
Build output directory: .
```

接真实后端时优先替换 `app.js` 中的这些边界：

```text
handleFiles -> POST /assets/upload
getVisibleAssets/renderAssets -> GET /assets 或 POST /search
confirmAsset -> POST /assets/:id/confirm-project
renderProfile -> GET /projects/:id/profile
createProject -> POST /projects
```

## 2026-06-17 项目管理补充

用户反馈无法新建项目，已补齐项目创建能力。

实现要点：

```text
index.html
  左侧项目区域新增新建项目表单：项目名、描述、关键词

styles.css
  新增侧栏表单、输入框、按钮和滚动样式

app.js
  defaultProjects 保留内置示例项目
  state.projects 持久化项目列表
  normalizeProjects 兼容旧 localStorage 数据
  createProject 新建项目并生成基础画像
  renderProjectControls / renderAssets / renderProfile 全部改用动态项目列表
  analyzeFile 支持按自定义项目名和关键词进行初步匹配
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
curl http://localhost:3000 返回 200
浏览器实测新建「测试项目A」后：
  左侧项目列表出现新项目
  项目筛选下拉出现新项目
  右侧项目画像切换到新项目
  反馈记录写入新建项目事件
```

## 2026-06-17 确认交互补充

用户反馈确认按钮点击后缺少反馈，且已确认素材仍显示确认按钮。

已调整：

```text
index.html
  素材卡片新增 inline-feedback
  页面新增 toast 状态提示

app.js
  项目选择下拉新增「请选择项目」空选项
  确认前校验项目不能为空，且不能确认到「待确认项目」
  已确认素材隐藏「确认」和「待确认」按钮
  已确认素材禁用项目下拉并显示「已归档到...」
  confirm / moveToPending / createProject 后显示 toast 反馈

styles.css
  新增 inline-feedback、toast、invalid select 样式
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
浏览器快照确认：
  未确认素材下拉包含「请选择项目」
  已确认素材显示「已归档到...」
  已确认素材不再显示「确认」和「待确认」按钮
```

## 2026-06-17 素材菜单补充

用户建议素材卡片右上角增加三个点按钮，并在下拉框中提供修改、删除。

已调整：

```text
index.html
  thumb-wrap 右上角新增 menu-trigger
  新增 card-menu，包含「修改」「删除」

app.js
  新增 editingAssetIds 保存当前编辑态素材
  点击「修改」后已确认素材重新显示项目下拉和「保存」按钮
  保存成功后退出编辑态，并继续复用非空项目校验
  点击「删除」会弹出确认框，确认后从 state.assets 移除并写入反馈
  点击卡片外部会关闭已打开菜单

styles.css
  新增三点按钮、菜单浮层、危险删除项样式
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
浏览器实测：
  每张素材卡片都有三个点菜单
  菜单打开后显示「修改」「删除」
  已确认卡片默认没有确认按钮
  点击「修改」后出现「保存」按钮和编辑提示
```

## 2026-06-17 概览指标调整

用户指出「平均置信度」和上传区右侧的「对象存储 / AI 识别 / 向量匹配 / 推荐项目」对最终用户没有明显价值。

已调整：

```text
index.html
  顶部第四个指标从「平均置信度」改为「可快速确认」
  上传区右侧从工程流程改为「归档任务」
  归档任务包含：可快速确认、需要判断、待人工确认、正在处理

app.js
  renderMetrics 改为统计各状态数量
  新增 countAssetsByStatus
  点击归档任务项会设置状态筛选并切回素材库

styles.css
  移除 pipeline 样式
  新增 review-panel / task-row 样式
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
浏览器实测：
  页面不再出现「平均置信度」
  页面不再出现工程流程文案
  点击「需要判断」后状态筛选切到 possible，列表标题显示「可能相关」
```

## 2026-06-17 外网访问与复制图片补充

用户要求通过 Cloudflare 实现外网访问，并新增可以复制图片的按钮，便于快速粘贴到即梦 AI 网页端。

已调整：

```text
index.html
  素材卡片操作区新增「复制图片」按钮

app.js
  新增 copyAssetImage
  新增 imageSourceToPngBlob
  复制时优先使用 ClipboardItem 写入 image/png
  浏览器不支持图片剪贴板时，降级复制图片数据链接
  复制成功/失败均显示 toast

_headers
  新增 Cloudflare Pages headers
  Cache-Control: no-store
  Permissions-Policy: clipboard-write=(self)

dist/
  新增 Cloudflare Pages 干净发布目录
  只包含 index.html、styles.css、app.js、_headers

photoManage-cloudflare-pages.zip
  新增可上传到 Cloudflare Pages 的干净压缩包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
curl http://localhost:3000/index.html 可看到复制按钮
浏览器实测每张素材卡片出现「复制图片」按钮
zip 包检查只包含 4 个公网文件
```

Cloudflare 状态：

```text
本机没有 wrangler / cloudflared / npm
尝试从 GitHub 下载 cloudflared，多次断流失败
Chrome 已安装，Codex Chrome Extension 已安装并启用
Chrome 当前未运行；需要用户允许打开 Chrome 后，才能继续用 Cloudflare Dashboard 操作 Pages 上传发布
```

## 2026-06-18 项目内部自由画布第一版

用户确认：项目体系和主页不改变，但项目内部通过自由画布构建。

已调整：

```text
index.html
  在素材区域新增 canvasArea
  新增 canvasToolbar：缩放、新建分组、便签、重置布局
  新增 canvasViewport / canvasWorld
  新增 canvasAssetTemplate

app.js
  新增 activeView = canvas 的项目内部视图
  点击左侧具体项目进入项目画布
  点击全部素材或素材库回到主页素材列表
  state.canvasLayouts 持久化每个项目的画布布局
  默认画布包含：角色参考、场景 / 道具、风格参考、说明便签
  项目相关素材会以可拖拽卡片形式出现在画布中
  支持画布空白处拖动平移
  支持按钮点击缩放，后续移除滚轮缩放以避免误触
  支持拖动素材、分组、便签
  支持新建 / 删除分组
  支持新建 / 删除便签
  支持双击分组名改名
  支持重置当前项目画布布局
  进入 canvas 视图时隐藏主页概览、上传和筛选条，让画布成为项目首屏

styles.css
  新增项目画布、工具栏、网格背景、素材节点、分组、便签样式
  新增 body[data-view="canvas"] 规则隐藏主页组件

dist/
  已同步到自由画布版本

photoManage-cloudflare-pages.zip
  已重新打包自由画布版本
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
浏览器实测：
  点击「赛博短片」进入 canvas 视图
  素材列表隐藏，项目画布显示
  画布内有素材卡片、3 个默认分组、1 个便签
  拖拽素材卡片后 DOM 位置变化，拖拽结束会 saveState
  canvas 视图中主页概览 / 上传 / 筛选条均隐藏
```

## 2026-06-18 画布视图去除右侧栏

用户指出项目画布右侧的 Project Profile 不必要，会占用画布空间。

已调整：

```text
styles.css
  body[data-view="canvas"] .content-grid 改为单列
  body[data-view="canvas"] .inspector 设置 display: none

行为
  素材库 / 待确认 / 普通列表视图仍保留右侧项目画像
  进入具体项目画布后隐藏右侧画像，画布铺满主内容区
```

验证结果：

```text
浏览器实测：
  点击「噜噜嘟嘟」进入 canvas
  inspectorDisplay = none
  contentColumns = 单列
  canvasWidth 接近 workspaceWidth
```

## 2026-06-18 自由画布增强

用户要求继续完善自由画布。

已调整：

```text
index.html
  画布工具栏新增「适配视图」
  画布工具栏新增「整理素材」
  canvasViewport 内新增 canvasMinimap 小地图
  canvasAssetTemplate 内新增素材快捷按钮：复制、待确认

app.js
  新增 fitCanvasToContent：根据素材 / 分组 / 便签边界自动缩放和平移到视图内
  新增 tidyCanvasAssets：按网格重新整理当前项目素材
  新增 renderCanvasMinimap：显示分组、素材点和当前视口
  新增 handleMinimapClick：点击小地图移动视角
  新增 startCanvasGroupResize：拖动分组右下角调整尺寸
  画布内素材卡可直接复制图片
  画布内素材卡可直接移入待确认

styles.css
  新增 canvas-resize-handle
  新增 canvas-asset-tools
  新增 canvas-minimap / minimap-box / minimap-dot / minimap-view
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
浏览器实测：
  进入「赛博短片」项目画布
  适配视图 / 整理素材按钮存在并可点击
  小地图渲染分组、素材点和视口框
  素材卡内出现复制 / 待确认快捷按钮
  拖动分组右下角，分组宽高发生变化
  dist/ 和 photoManage-cloudflare-pages.zip 已同步
```

## 2026-06-18 Cloudflare 发布完成

用户允许打开 Chrome 后，通过 Cloudflare Dashboard 完成静态文件上传部署。

发布信息：

```text
Cloudflare 应用名称：photo-manage
公网地址：https://photo-manage.dn2king666.workers.dev/
部署方式：Cloudflare Dashboard -> Workers 和 Pages -> Upload your static files
上传目录：dist/
上传文件：
  _headers
  app.js
  index.html
  styles.css
```

验证结果：

```text
Chrome 成功打开公网地址
页面标题为「AI 图片素材库」
素材卡片正常渲染
「复制图片」按钮存在
点击「复制图片」后显示 toast：「图片已复制，可以粘贴到即梦 AI」
终端 curl 在当前网络下访问 workers.dev 超时，但 Chrome 实测公网页面可用
```

## 2026-06-18 自由画布交互收敛

用户反馈：

```text
画布滚轮缩放有点难用，需要去掉，改成鼠标点击缩放。
画布下方的「没有匹配素材」区域对项目内部画布没用，需要隐藏。
继续聚焦把自由画布做好。
```

已调整：

```text
index.html
  画布提示文案改为：点击 +/- 或双击空白处缩放

app.js
  移除 canvasViewport 的 wheel 缩放监听
  删除 handleCanvasWheel
  新增 handleCanvasDoubleClick，双击画布空白处放大
  保留工具栏 +/- 作为主要鼠标点击缩放入口

styles.css
  新增 .empty-state[hidden] { display: none; }
  修复 canvas 模式下 hidden 被 .empty-state 的 display:grid 覆盖的问题
```

产品结论：

```text
项目内部画布不再展示素材列表空状态。
滚轮只保留页面原生滚动行为，不再承担画布缩放。
画布缩放入口集中到按钮点击和空白处双击。
```

## 2026-06-18 项目内连续上传修复

用户反馈：

```text
在项目内部上传第二张图片就没反应了。
```

问题判断：

```text
项目画布模式下，上传入口仍可点击，但 handleFiles 新建的处理中素材默认 recommendedProjectId = unassigned。
如果文件名没有命中当前项目关键词，AI 模拟识别完成后也可能继续留在待确认项目。
结果是在具体项目画布内上传时，新增素材不会稳定出现在当前画布，用户会感觉第二张或后续上传没有反应。
```

已调整：

```text
app.js
  新增 getActiveUploadProjectId
  handleFiles 在上传入口捕获当前项目画布 ID
  项目内上传的处理中素材立即挂到当前项目 recommendedProjectId
  项目内上传的处理中描述和推荐理由改为当前项目语境
  analyzeFile 新增 preferredProjectId 参数
  项目内上传优先沿用当前项目作为推荐项目，避免识别后跳到待确认或其他项目导致画布消失
  renderCanvas 中上传按钮文案改为「上传到项目名」
  renderAssets 中上传按钮文案恢复为「上传图片」

dist/
  已同步 app.js

photoManage-cloudflare-pages.zip
  已重新打包，包含 index.html / styles.css / app.js / _headers
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
本地服务 PORT=3001 node server.js 可启动
浏览器确认：
  进入「噜噜嘟嘟」后 body[data-view] = canvas
  项目画布标题显示「噜噜嘟嘟画布」
  顶部上传按钮显示「上传到噜噜嘟嘟」
说明：
  当前 in-app browser 测试环境只暴露 DOM 读能力，无法构造 File / Blob / DataTransfer 做真实文件输入自动化。
  文件上传修复已通过代码路径和语法检查确认，真实浏览器手动上传应表现为连续上传的素材都留在当前项目画布。
```

## 2026-06-18 列式关系画布第一版

用户方向：

```text
希望项目内部自由画布参考关系板形态，不再以大框为主。
素材应该放在每列当中，方便构建角色、状态、场景、视频之间的关系。
```

产品判断：

```text
长期更适合采用「列式关系画布」。
当前大框方案更像归类文件夹，适合 MVP 早期粗分组，但不利于表达素材之间的横向关系。
列式画布更适合 AI 视频创作工作流：
  参考素材 -> 角色 / 状态 -> 场景 / 镜头 -> 输出结果
```

已调整：

```text
app.js
  CANVAS_LAYOUT_VERSION 升级到 3
  新增 CANVAS_COLUMNS，默认 4 列：
    参考素材
    角色 / 状态
    场景 / 镜头
    输出结果
  新建画布默认不再创建「角色参考 / 场景道具 / 风格参考」三个大分组框
  旧布局升级时会清理这三个默认分组框
  保留用户手动点击「新建分组」创建临时小组的能力
  renderCanvas 新增列背景渲染
  ensureCanvasAssetPositions 改为按列给素材初始位置
  inferCanvasColumnId 根据标题、描述、标签、推荐理由推断素材应该进入哪一列
  tidyCanvasAssets 改为按列纵向整理素材
  拖动素材时会根据横向位置更新 columnId，形成轻量吸附
  getCanvasContentBounds 和 renderCanvasMinimap 支持列式画布

index.html
  画布帮助文案改为强调把素材拖进不同列，建立关系

styles.css
  新增 canvas-column / canvas-column-head 样式
  列是淡色泳道，不再像大框一样强约束素材
  素材卡根据 columnId 有轻微边框差异
  小地图新增 minimap-column

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包，包含 4 个公网文件
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
浏览器实测：
  重置示例后进入「噜噜嘟嘟」项目
  body[data-view] = canvas
  画布渲染 4 个列区：
    参考素材
    角色 / 状态
    场景 / 镜头
    输出结果
  默认大分组框数量为 0
  示例「噜噜同 IP 小床」进入 source / 参考素材列
  画布帮助文案已更新为列式关系说明
```

## 2026-06-18 列式画布顶部重叠修复

用户反馈：

```text
画布顶部说明、列标题、素材 / 分组视觉上重叠到一起。
```

已调整：

```text
app.js
  CANVAS_LAYOUT_VERSION 升级到 4
  CANVAS_COLUMNS 的 y 从 44 下移到 96
  列高度从 1380 调整为 1320
  新素材和整理素材的起始 y 改为 column.y + 102
  旧布局升级时：
    顶部过近的 group 自动下移到 y >= 210
    顶部过近的 note 自动下移到 y >= 150
    顶部过近的 asset 自动下移到 y >= 182
  新建分组默认也限制在 y >= 210，避免贴住列头

styles.css
  canvas-help 改成独立提示条，增加 padding、border、背景和行高
  canvas-column-head 背景加深，和画布网格、提示条拉开层次

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
浏览器实测：
  进入「噜噜嘟嘟」项目画布
  helpBottom = 265
  viewportTop = 275
  columnTop = 372
  cardTop = 474
  顶部提示条、列标题和素材卡不再重叠
```

## 2026-06-18 画布素材悬停删除

用户建议：

```text
在项目画布页面删除素材时，鼠标放在图片上，右上角出现 X 按钮。
```

已调整：

```text
index.html
  canvasAssetTemplate 新增 canvas-delete-asset 按钮
  按钮 aria-label 为「删除素材」

app.js
  renderCanvas 为 canvas-delete-asset 绑定点击事件
  点击 X 会 stopPropagation，避免触发拖拽
  点击 X 后复用 deleteAsset(asset.id)
  deleteAsset 删除素材时同步清理所有 canvasLayouts 中对应 asset 的 items 位置记录

styles.css
  新增 canvas-delete-asset 样式
  删除按钮定位在素材卡右上角
  默认 opacity = 0
  .canvas-asset-card:hover / :focus-within 时显示
  处理中素材禁用删除按钮

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
浏览器确认：
  项目画布素材卡内存在 canvas-delete-asset 按钮
  aria-label = 删除素材
  默认 opacity = 0
  hover CSS 规则存在
```

## 2026-06-18 处理中素材允许删除

用户反馈：

```text
项目画布里 AI 识别中的素材右上角 X 出现了，但不让删。
```

已调整：

```text
app.js
  移除 canvas-delete-asset 在 processing 状态下的 disabled 逻辑
  处理中素材也可以点击 X 删除

styles.css
  移除 canvas-delete-asset:disabled 样式，避免出现看得到但不能点的状态

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
```

## 2026-06-23 Qwen 视觉调用成功与日志补充

用户询问：

```text
目前视觉模型 API 调用是否成功，是否可以查看日志。
```

验证结果：

```text
.env 已配置 DASHSCOPE_API_KEY
当前模型：
  qwen-vl-plus

第一次用 1x1 PNG 测试：
  请求已到达 Qwen API
  返回 400
  原因：图片宽高必须大于 10

第二次用 32x32 PNG 测试：
  POST /api/analyze-image 返回 200
  返回 title / recommended_project_id / confidence
  示例：
    title = 彩色方块测试图
    recommended = unassigned
    confidence = 0.6
```

已调整：

```text
server.js
  handleAnalyzeImage 增加成功日志
  成功格式：
    [AI] 时间 model=模型名 file="文件名" recommended=项目 confidence=置信度 duration=耗时ms
  失败格式：
    [AI:ERROR] 时间 code=错误码 status=状态码 duration=耗时ms message=错误信息
  日志不打印 DASHSCOPE_API_KEY
```

终端日志示例：

```text
[AI] 2026-06-23T02:06:43.133Z model=qwen-vl-plus file="log-test-color-block.png" recommended=unassigned confidence=0.6 duration=2302ms
```

验证命令：

```text
node --check server.js 通过
node --check app.js 通过
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 画布输出列误判修复

用户反馈：

```text
识别完后还是没有到特定的列内。
示例：可爱旋转木马场景被放到「输出结果」，应进入「场景 / 镜头」。
```

问题判断：

```text
上一版前端优先相信 Qwen 返回的 canvas_column_id。
如果模型把静态 AI 生成图、场景图误判为 output，前端会直接放入「输出结果」。
但产品定义中 output 应只用于视频、成片、最终输出。
```

已调整：

```text
server.js
  Qwen prompt 增加约束：
    静态图片、AI 生成图、参考图、场景图即使是“生成出来的图片”，也不要放 output
    只有视频 / 成片 / 最终交付结果才放 output

app.js
  inferCanvasColumnId 不再无条件相信 canvasColumnId=output
  output 只匹配强信号：
    视频 / 成片 / 最终输出 / 输出结果 / 待复用结果 / 即梦视频 / 即梦成片
  scene 优先匹配：
    场景 / 环境 / 背景 / 镜头 / 分镜 / 旋转木马 / 游乐园 / 乐园
  source 匹配：
    道具 / 配饰 / 头饰 / 发箍 / 船 / 天鹅船 / 玩具 / 小物 / 物件 / 物品

index.html
  版本参数更新为：
    styles.css?v=20260623-column-rules
    app.js?v=20260623-column-rules

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
规则测试：
  可爱旋转木马场景 -> scene
  爱心发箍 -> source
  即梦视频成片 -> output
curl http://localhost:3000/ 可看到 app.js?v=20260623-column-rules
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 画布对应框入列增强

用户澄清：

```text
识别完成后应该放在对应的框里。
例如头饰 / 发箍 / 道具类素材不应该停在「输出结果」框。
```

已调整：

```text
server.js
  Qwen prompt 新增 canvas_column_id 字段
  要求 Qwen 只能返回：
    source
    state
    scene
    output
  新增画布列选择规则：
    source：普通参考图、角色参考、道具、配饰、头饰、玩具、原始图、单个物体、可复用素材
    state：角色表情、造型、姿态、服装上身效果、人物状态
    scene：环境、场景、建筑、街道、房间、天气、氛围、分镜、镜头参考
    output：已经生成的视频、成片、最终输出、待复用结果
  sanitizeAnalysis 会清洗 canvas_column_id，不合法时降级为 source

app.js
  makeAssetFromAnalysis 保存 canvasColumnId
  inferCanvasColumnId 优先使用 AI 返回的 canvasColumnId
  本地兜底入列加入 visualFeatures
  本地 source 关键词增强：
    配饰 / 头饰 / 发箍 / 船 / 天鹅船 / 玩具 / 小物 / 物件 / 物品

index.html
  版本参数更新为：
    styles.css?v=20260623-column-id
    app.js?v=20260623-column-id

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000/ 可看到 app.js?v=20260623-column-id
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 画布识别后自动入列修复

用户反馈：

```text
视觉模型识别成功，但图片没有放到该放的画布列里。
示例：卡通天鹅船识别成功后停在「输出结果」列。
```

问题判断：

```text
处理中素材的描述包含「正在生成标题」。
inferCanvasColumnId 之前把「生成」匹配为 output。
因此处理中卡片会先进入「输出结果」列。
AI 识别完成后，layout.items 已存在，ensureCanvasAssetPositions 只补 columnId，不会重新按最终识别结果入列。
```

已调整：

```text
app.js
  inferCanvasColumnId 中 processing 状态固定进入 source / 参考素材
  output 关键词从泛化的「生成」改为更明确的「生成结果」
  新增 autoPlaced 标记
  新建素材位置 autoPlaced = true
  用户拖拽素材后 autoPlaced = false
  AI 识别完成后：
    如果素材仍是自动摆放状态
    且最终识别列和当前列不同
    自动移动到最终识别列
  用户手动拖过的素材不会被 AI 结果重新移动

index.html
  版本参数更新为：
    styles.css?v=20260623-canvas-reflow
    app.js?v=20260623-canvas-reflow

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000/ 可看到 app.js?v=20260623-canvas-reflow
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 Qwen-VL-Plus 真实图片识别链路

用户要求：

```text
以 qwen-vl-plus 模型先打通前后端链路，实现上传图片后自动识别然后分类的效果。
```

实施方案：

```text
保持当前无 npm 依赖的 Node 服务。
不引入数据库，继续使用 localStorage 保存前端素材状态。
后端新增 /api/analyze-image，前端上传后把图片 data URL、文件名、项目列表和当前项目 ID 发给后端。
后端调用阿里云百炼 OpenAI 兼容接口：
  https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
模型默认：
  qwen-vl-plus
```

已调整：

```text
server.js
  新增 .env 读取能力，不依赖 dotenv
  新增 DASHSCOPE_API_KEY / QWEN_VISION_MODEL / QWEN_API_URL 配置
  新增 POST /api/analyze-image
  接收 imageDataUrl / fileName / preferredProjectId / projects
  调用 qwen-vl-plus 视觉模型
  使用 response_format=json_object 要求返回 JSON
  解析并清洗 AI 返回字段：
    title
    description
    tags
    visual_features
    recommended_project_id
    confidence
    reason
  若未配置 DASHSCOPE_API_KEY，返回 503 和明确错误信息
  若推荐项目 ID 不在项目列表中，自动降级为 unassigned
  增加 CORS 响应头，方便前端和后端分离部署

app.js
  handleFiles 不再使用 setTimeout 模拟 AI 识别
  新增 analyzeUploadedImage 调用 /api/analyze-image
  新增 makeAssetFromAnalysis，把 AI JSON 映射到素材结构
  新增 makeFailedAnalysisAsset，识别失败时保留图片并进入待确认
  支持 localStorage.photoManage.apiBaseUrl 指向独立后端域名
  项目画布内上传仍自动 confirmed 到当前项目
  素材库首页上传仍根据 confidence 进入 recommended / possible / pending

.env.example
  新增 DASHSCOPE_API_KEY
  新增 QWEN_VISION_MODEL=qwen-vl-plus
  新增 QWEN_API_URL

README.md
  更新本地启动说明
  新增 Qwen 视觉识别链路说明
  更新已实现能力，不再描述为纯模拟 AI

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000/ 返回 200
未配置 DASHSCOPE_API_KEY 时：
  POST /api/analyze-image 返回 503
  body = {"error":"MISSING_DASHSCOPE_API_KEY","message":"请先配置 DASHSCOPE_API_KEY 再启动服务。"}
说明：
  当前环境没有用户的百炼 API Key，因此未做真实 qwen-vl-plus 在线识别调用。
  配置 .env 后重启 node server.js 即可走真实视觉识别链路。
```

## 2026-06-23 项目空状态自愈修复

用户反馈：

```text
项目都没了，并且新建项目失败。
```

问题判断：

```text
本地 localStorage 可能保留了空素材 / 空项目 / 默认项目被删除的状态。
旧 loadState 只在 saved.assets.length 为真时读取本地状态，不适合真实空素材库。
同时 deletedProjectIds 可能让默认项目全部被过滤，导致侧栏项目列表为空。
```

已调整：

```text
app.js
  loadState 改为只要 saved.assets 是数组就读取本地状态，允许素材数量为 0
  新增 hasUsableProjects
  loadState 发现项目列表没有任何普通项目时，清空 deletedProjectIds 并恢复默认项目
  getProjects 增加运行时自愈：
    如果项目列表只剩 unassigned 或为空，自动恢复默认项目并保存状态

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 项目空状态二次修复

用户反馈：

```text
刷新后项目列表仍然为空，新建项目仍然不可用。
```

进一步判断：

```text
Chrome 可能仍在加载旧 app.js。
同时 localStorage.deletedProjectIds 可能包含所有默认项目 ID：
  lulu
  cyber
  ancient
导致 normalizeProjects 把默认项目全部过滤掉。
```

已调整：

```text
index.html
  styles.css 和 app.js 增加版本参数：
    ?v=20260623-project-repair
  避免浏览器继续使用旧缓存

app.js
  新增 repairDeletedProjectIds
  如果 deletedProjectIds 同时包含所有默认项目，则自动清空 deletedProjectIds
  loadState 调用 repairDeletedProjectIds 后再 normalizeProjects

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
模拟 deletedProjectIds = [lulu, cyber, ancient] 时，repairDeletedProjectIds 返回 []
curl http://localhost:3000/ 可看到 app.js?v=20260623-project-repair
本地服务已重启到 http://localhost:3000
```

## 2026-06-23 按钮无响应 JS 初始化修复

用户反馈：

```text
页面所有按钮点击后都没有响应。
```

问题判断：

```text
Chrome 控制台报错：
  SyntaxError: Identifier 'clamp' has already been declared
Qwen 识别链路新增了一个 clamp(value, min, max, fallback)。
原画布缩放逻辑已存在 clamp(value, min, max)。
ES module 顶层函数名重复导致 app.js 整个模块初始化失败，因此 bindEvents 没有执行，所有按钮失效。
```

已调整：

```text
app.js
  AI 置信度兜底函数从 clamp 改名为 clampScore
  保留原画布 clamp 函数，避免影响缩放 / 拖拽逻辑

index.html
  版本参数更新为：
    styles.css?v=20260623-js-fix
    app.js?v=20260623-js-fix
  强制 Chrome 加载新脚本

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
脚本扫描结果：no duplicate function names
curl http://localhost:3000/ 可看到 app.js?v=20260623-js-fix
本地服务已重启到 http://localhost:3000
```

## 2026-06-22 项目删除功能补充

用户澄清：

```text
需要删除的是左侧项目，不是项目画布里的素材。
```

已调整：

```text
app.js
  左侧项目列表改为项目行结构：项目按钮 + 项目操作三点菜单
  全部素材 / 待确认项目不显示删除入口
  普通项目右侧悬停显示三点按钮
  三点菜单内新增「删除项目」
  新增 deleteProject
  删除项目时不删除素材
  项目内素材统一移入「待确认项目」
  同步清理该项目的 canvasLayouts
  删除当前正在查看的项目后自动返回素材库
  写入反馈记录并显示 toast
  新增 deletedProjectIds，避免被删除的内置示例项目刷新后被 normalizeProjects 自动补回
  点击「重置示例」会清空 deletedProjectIds，恢复示例项目
  点击页面其他区域会关闭项目菜单

styles.css
  新增 project-row / project-menu-trigger / project-menu 样式
  项目菜单默认隐藏，hover / focus 时显示
  删除项目使用危险色样式

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包，包含 index.html / styles.css / app.js / _headers
```

行为规则：

```text
删除项目「古风短剧」后：
  项目从左侧列表移除
  项目画布布局移除
  原项目内素材不会删除
  这些素材 projectId = null
  recommendedProjectId = unassigned
  status = pending
  reason 更新为原项目已删除，等待重新归档
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
zip 包已重新生成
浏览器验证：
  左侧项目列表出现 3 个项目操作菜单
  全部素材 / 待确认项目没有项目操作菜单
  古风短剧菜单可打开，并只显示 1 个「删除项目」按钮
说明：
  自动化点击原生 window.confirm 后被浏览器确认框阻塞，新标签也受影响；
  删除确认后的状态变化通过代码路径、语法检查和 dist 同步校验确认。
```

## 2026-06-22 项目列表数字对齐修复

用户反馈：

```text
左侧项目列表里，有三点菜单的项目数字和没有三点菜单的项目数字没有对齐。
```

已调整：

```text
styles.css
  project-nav-item 改为固定三列：名称列 / 数字列 / 操作列
  project-row 不再使用菜单列参与布局
  project-menu-wrap 改为绝对定位到项目行右侧
  project-count 增加居中对齐

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check dist/app.js 通过
node --check server.js 通过
dist matches source
```

## 2026-06-22 项目内上传确认状态修复

用户反馈：

```text
确认功能还有问题，上传的每张照片都是未确认。
```

问题判断：

```text
项目画布内按钮显示「上传到项目名」。
但 handleFiles 只把新素材 recommendedProjectId 设置为当前项目。
AI 模拟识别完成后 analyzeFile 仍然让 projectId = null。
status 也按分数变成 recommended / possible，而不是 confirmed。
结果是项目内上传的图片看起来都只是推荐或未确认，并没有真正归档到当前项目。
```

已调整：

```text
app.js
  analyzeFile 新增 shouldAutoConfirm 判断
  从项目画布上传时：
    projectId = 当前项目
    recommendedProjectId = 当前项目
    status = confirmed
    reason 改为用户在该项目内上传，已直接归档
  handleFiles 在项目内上传完成后写入反馈记录
  首页素材库上传仍保留原有 AI 推荐 / 待确认流程

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
```

## 2026-06-23 后端二阶段视觉识别与画布列分类

用户判断：

```text
画布列归档不应该只靠前端关键词规则。
图片上传后，后端应先调用视觉模型识别图片，再把视觉识别结果交给另一个思考 / 分类模型，
结合当前项目已有类别，输出这个素材应该进入哪个画布类别。
```

产品结论：

```text
后端成为分类决策源。
前端只负责把项目上下文和画布列定义传给后端，并按后端返回的 canvas_column_id 放入对应列。
前端保留少量规则兜底，避免模型异常时素材全部进入错误列。
```

已调整：

```text
server.js
  新增 qwenClassifierModel
  支持环境变量 QWEN_CLASSIFIER_MODEL，默认 qwen-plus
  /api/analyze-image 改为二阶段：
    1. qwen-vl-plus / QWEN_VISION_MODEL 负责图片视觉理解
    2. qwen-plus / QWEN_CLASSIFIER_MODEL 负责从现有画布列中选择 canvas_column_id
  新增 defaultCanvasColumns
  新增 normalizeCanvasColumns
  新增 classifyCanvasColumnWithQwen
  新增 buildCanvasClassifierPrompt
  新增 sanitizeCanvasClassification
  AI 成功日志增加 vision / classifier / column
  分类模型失败时记录 [AI:COLUMN_ERROR]，并降级到 source 列

app.js
  analyzeUploadedImage 请求体新增 canvasColumns
  makeAssetFromAnalysis 继续保存后端返回的 canvas_column_id
  inferCanvasColumnId 改为优先尊重后端分类结果
  但对 output 列保留强约束，避免普通静态图片被误判为输出结果
  ensureCanvasAssetPositions 对 autoPlaced 素材支持识别完成后自动移入新列
  用户手动拖动后的素材 autoPlaced = false，不再被自动改列

index.html
  资源版本更新到 20260623-ai-router，避免浏览器继续使用旧缓存

.env.example
  新增 QWEN_CLASSIFIER_MODEL=qwen-plus

README.md
  更新 Qwen 链路说明：
    前端图片 data URL -> /api/analyze-image
    后端视觉模型识别
    后端分类模型决定画布类别
    返回 title / description / tags / visual_features / canvas_column_id / recommended_project_id / confidence / reason

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

真实接口验证：

```text
POST /api/analyze-image
测试图片：64x64 卡通场景色块图
返回：
  status = 200
  title = 卡通场景轮播图
  canvas_column_id = scene
  canvas_column_reason = 图片为卡通风格的天空与大地场景，包含蓝天、绿地和太阳，属于环境类视觉元素，符合「场景 / 镜头」类别的定义。
  recommended_project_id = unassigned
  confidence = 0.6
```

服务日志：

```text
[AI] 2026-06-23T07:15:21.685Z vision=qwen-vl-plus classifier=qwen-plus file="carousel-scene-test.png" recommended=unassigned column=scene confidence=0.6 duration=4002ms
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
node --check dist/app.js 通过
dist matches source
真实 /api/analyze-image 调用成功，并由后端分类模型返回 scene 列
```

## 2026-06-23 松鼠角色误入场景列修复

用户反馈：

```text
松鼠嘚嘚这类单个角色图被放到了「场景 / 镜头」列。
```

问题判断：

```text
后端日志显示：
  file="松鼠嘚嘚.png" recommended=lulu column=source confidence=0.95

说明视觉 / 分类后端没有把该图判成 scene。
真正问题在前端 inferCanvasColumnId：
  1. 前端旧逻辑先跑本地关键词规则，再使用后端 canvasColumnId
  2. visual.scene 的兜底值是「未知场景」
  3. 本地 scene 正则只要看到「场景」就返回 scene
结果导致后端返回 source 的素材仍被前端覆盖到「场景 / 镜头」列。
```

已调整：

```text
app.js
  inferCanvasColumnId 改为真正优先使用后端 canvasColumnId
  只有后端返回 output 时做额外保护，避免静态图片误入输出列
  过滤「未知主体 / 未知场景 / 未知风格 / 素材参考」这类兜底词
  本地兜底规则顺序改为：
    output -> character/state -> source -> scene
  新增松鼠、卡通形象、IP形象、动物角色、玩偶等角色关键词进入 state 兜底
  scene 不再匹配泛化的单个「场景」词，改为环境、背景、镜头、分镜、游乐园、建筑等更具体词

server.js
  分类提示词新增主主体优先原则
  明确不要因为识别结果里出现「场景」两个字就放入 scene
  明确单个 IP 角色、动物角色、人物、卡通形象、玩偶形象、姿态造型应放 state
  source 调整为道具、配饰、玩具、船、单个非角色物体、原始参考图

index.html
  资源版本更新到 20260623-character-router，避免浏览器继续使用旧 app.js

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
本地逻辑测试：
  后端返回 source 的「圆润松鼠卡通形象」 -> source
  没有后端列但标题为「圆润松鼠卡通形象」 -> state
  「可爱旋转木马场景」 -> scene
本地服务已重启：
  http://localhost:3000
```

## 2026-07-02 上传无反应排查与 MIME 兜底

用户反馈：

```text
在 Cloudflare Tunnel 公网地址点击上传后页面没有新增处理中卡片，看起来没有反应。
```

排查结论：

```text
后端日志没有出现新的 /api/assets 或 AI job 记录。
data/state.json 和 GET /api/assets 中素材数量也没有增加。
所以这不是“后台正在处理但前端没刷新”，而是前端没有成功把文件创建成后端 asset。
```

可能原因：

```text
handleFiles 之前只通过 file.type 判断文件类型。
部分图片、音频或视频文件在浏览器里可能拿到空 MIME 或非标准 MIME。
这类文件会被前端静默过滤，导致用户感觉点击上传没有任何反应。
```

已调整：

```text
app.js
  handleFiles 增加 incomingFiles 和无可用文件 toast：
    没有识别到支持的图片、音频或视频文件
  进入上传流程后立即 toast：
    N 个素材正在上传
  文件读入完成后立即 upsert 本地 processing 卡片并 render：
    即使后端创建 asset 或 AI job 较慢，画布也会马上出现「AI 识别中」
  上传失败 catch 分支会把本地卡片改为 failed：
    保留 thumbnail / originalSrc / audioSrc / videoSrc，避免失败后变成纯占位图
  FileReader 增加 error 监听：
    文件读取失败时显示明确 toast
  isImageFile / isAudioFile / isVideoFile 增加文件扩展名兜底：
    图片：png / jpg / jpeg / webp / gif / bmp / avif / heic / heif
    音频：mp3 / wav / m4a / aac / ogg / flac / opus
    视频：mp4 / mov / webm / m4v / avi / mkv
  新增 normalizeMediaDataUrl：
    当 FileReader 生成的 data URL MIME 为空或不匹配时，按文件扩展名补成 image/audio/video MIME
  saveState 只向 /api/state 同步 getLocalUiState：
    不再把 state.assets 作为快照反写后端，避免旧前端状态覆盖后端 authoritative asset

dist/
  已同步 app.js

photoManage-cloudflare-pages.zip
  已重新打包

server.js
  /api/assets/:id/analyze 重新识别时优先使用 asset.originalSrc，其次才 fallback 到 asset.thumbnail
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist/app.js 与 app.js 一致
公网 tunnel 登录后可取到新版 app.js
```

## 2026-07-02 识别失败仍显示原图修复

用户反馈：

```text
识别失败后卡片仍显示「待确认」占位图，而不是上传的原图片。
```

问题判断：

```text
失败状态只是 AI 识别失败，不代表图片素材本身失败。
UI 必须优先显示原图，不能用「待确认」或「识别失败」蒙版替代图片内容。
当前后端已有 3 条旧失败素材缺少 originalSrc，thumbnail 也是占位 SVG；这类历史记录无法凭空恢复原图，只能提示重新上传。
```

已调整：

```text
app.js
  getAssetImageSource：
    failed 状态优先返回 originalSrc
    没有 originalSrc 时返回非占位 thumbnail
    两者都没有时才显示「原图缺失，请重传」专用占位
  normalizeAssets：
    image 素材如果 originalSrc 缺失但 thumbnail 是真实图片，则自动补 originalSrc
    failed 素材如果 originalSrc 存在，则 thumbnail 强制同步为 originalSrc
    failed 素材如果只有待确认 / 识别失败占位，则替换为「原图缺失」占位
  makeFailedAnalysisAsset：
    图片失败默认使用「原图缺失」占位，而不是空图或待确认占位
  isGeneratedPlaceholder：
    增加「原图缺失」占位识别

server.js
  sanitizeStoredAsset：
    服务端同样执行 originalSrc / thumbnail 归一化
    failed 图片有原图时强制显示原图
    failed 图片没有原图时使用「原图缺失，请删除后重新上传」占位
    processing 图片如果超过 10 分钟未更新，视为 AI job 中断，自动改为 failed，但保留 originalSrc 供重识别使用

data/state.json
  已清理 3 条旧 failed 占位素材：
    由于这些记录没有保存 originalSrc，无法恢复原图
    已改为明确的「原图缺失」提示，避免继续显示「待确认」假图
  已将 1 条服务重启后卡住的 processing 素材转为 failed，并保留原图，可点击重识别
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist/app.js 与 app.js 一致
```

## 2026-07-07 后端状态迁移到 SQLite

用户要求：

```text
把图片 / 素材数据改成数据库存储。
```

实现判断：

```text
当前项目仍保持无 npm 依赖。
本地 Node 运行时支持内置 node:sqlite，因此先使用 SQLite 作为数据库层。
这一步把主存储从 data/state.json 迁到 data/photo-manage.sqlite。
图片仍暂时以 data URL 字符串存在 asset 记录里，后续大量素材时再迁 Cloudflare R2 / S3。
```

已调整：

```text
server.js
  引入 node:sqlite 的 DatabaseSync
  新增 databaseFile = data/photo-manage.sqlite
  启动时 initDatabase：
    创建 metadata
    创建 ui_state
    创建 assets
    创建 assets 排序 / 更新时间索引
    开启 WAL 和 NORMAL synchronous
  首次启动自动迁移 data/state.json：
    读取旧 JSON
    sanitize 后写入 SQLite
    metadata.state_json_migrated = 1
  readStoredState / writeStoredState 改为 SQLite 读写
  /api/state PUT 不再接受前端传回的 assets：
    assets 只保留数据库已有值
    避免旧浏览器快照覆盖后端 authoritative asset

README.md
  后端状态持久化说明从 data/state.json 更新为 data/photo-manage.sqlite
  说明 state.json 迁移后只作为旧数据备份
  说明当前 SQLite 仍保存图片 data URL，后续建议迁对象存储
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
重启服务后日志显示：
  migrated 12 assets from data/state.json to photo-manage.sqlite
GET /api/assets 返回 12 条素材
GET /api/state 返回：
  assets = 12
  projects = 4
  feedback = 7
```

## 2026-07-07 AI 识别任务日志表

用户要求：

```text
加一张 ai_logs / ai_jobs 表，后续能分析为什么识别失败。
```

实现判断：

```text
沿用当前 SQLite 数据库，不引入新依赖。
使用 ai_jobs 表承载 AI 调用日志：
  一次同步诊断识别或一次异步上传 / 重识别任务 = 一条记录
  成功记录推荐项目、画布列、置信度、耗时和模型
  失败记录错误码、HTTP 状态、错误信息和耗时
  不保存图片 base64，只保存请求摘要，避免日志表膨胀
```

已调整：

```text
server.js
  initDatabase 新增 ai_jobs 表：
    id
    asset_id
    type
    status
    vision_model
    classifier_model
    file_name
    recommended_project_id
    canvas_column_id
    confidence
    duration_ms
    error_code
    error_status
    error_message
    request_summary
    response_json
    created_at
    updated_at
    completed_at
  新增索引：
    idx_ai_jobs_asset_id
    idx_ai_jobs_status
    idx_ai_jobs_created_at
  启动时 markInterruptedAiJobs：
    把上次进程残留的 processing 任务标记为 failed
    错误码 AI_JOB_INTERRUPTED
  新增 createAiJobRecord / updateAiJobRecord / readAiJobRecord / listAiJobRecords
  新增 summarizeAiRequest，只记录文件名、项目数量、列数量、是否有图片、图片体积估算
  /api/analyze-image：
    同步识别也写 ai_jobs
  /api/analyze-image-jobs：
    异步识别创建 processing 日志
    成功 / 失败后更新同一条日志
  /api/analyze-image-jobs/:id：
    内存 job 找不到时回退查 SQLite ai_jobs
  新增：
    GET /api/ai-jobs
    GET /api/ai-jobs?assetId=素材ID
    GET /api/ai-jobs?status=failed&limit=20

README.md
  后端状态接口补充 GET /api/ai-jobs
  说明 ai_jobs 可用于排查识别失败
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
重启服务后确认 SQLite 已创建 ai_jobs 表
调用一次识别后 GET /api/ai-jobs?assetId=... 可返回记录：
  status = completed
  type = sync_image_analysis
  confidence = 0.95
  durationMs = 6161
构造 INVALID_IMAGE 失败请求验证 error_code / error_status / error_message 可写入
随后清理 invalid-log-test.png 测试失败日志，避免污染真实失败列表
```

## 2026-07-07 统一应用图标

用户提供：

```text
assets/icon.svg
```

用户要求：

```text
将所有图标改成这个。
```

已调整：

```text
index.html / dist/index.html
  当前 favicon 已指向 ./assets/icon.svg
  侧边栏 brand-mark 已使用 ./assets/icon.svg

server.js
  登录页新增 favicon：
    /assets/icon.svg
  登录页原先写死的「AI」方块改为 img：
    /assets/icon.svg
  未登录状态下放行 /assets/icon.svg 静态资源
  提取 sendStaticFile 复用静态文件响应逻辑

assets/icon.svg
dist/assets/icon.svg
  两份图标内容一致
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
未登录访问 /assets/icon.svg 返回：
  HTTP/1.1 200 OK
  content-type: image/svg+xml
登录页 HTML 包含：
  <link rel="icon" href="/assets/icon.svg" type="image/svg+xml" />
  <div class="brand"><img src="/assets/icon.svg" alt="" /></div>
公网 Tunnel 验证：
  https://isle-registry-vice-humor.trycloudflare.com/assets/icon.svg
  HTTP/2 200
  content-type: image/svg+xml
```

## 2026-07-02 账号密码登录保护

用户要求：

```text
加一个账户密码登录，避免 Cloudflare Tunnel 外网访问时资源被侵占。
```

已调整：

```text
server.js
  新增服务端登录保护，默认 AUTH_ENABLED=true
  新增 /login 登录页
  新增 POST /api/login
  新增 POST /api/logout
  /api/logout 仅接受 POST，GET 返回 405
  使用 HttpOnly Cookie 保存登录会话
  Cookie 默认：
    name = pm_session
    SameSite=Lax
    Path=/
    Max-Age=604800
  会话 token 使用 AUTH_SESSION_SECRET 做 HMAC-SHA256 签名
  未登录时：
    页面和静态资源 302 跳转 /login
    /api/state 与 /api/analyze-image 返回 401
  保持 /api/health 公开，方便 tunnel / 监控检查
  ADMIN_PASSWORD 未配置时不会放行资源访问

index.html
  顶部操作区新增「退出登录」按钮
  资源版本更新到 20260702-auth-login

app.js
  新增 logoutButton 绑定
  新增 handleLogout
  点击退出登录会调用 /api/logout 清除 Cookie，并回到 /login
  如果配置了 photoManage.apiBaseUrl，会跳转到对应后端登录页

.env.example
  新增 AUTH_ENABLED / ADMIN_USERNAME / ADMIN_PASSWORD / AUTH_SESSION_SECRET / AUTH_MAX_AGE_SECONDS 示例

README.md
  新增账号密码登录说明
  记录受保护接口与公开接口

.env
  已在本机写入 ADMIN_USERNAME / ADMIN_PASSWORD / AUTH_SESSION_SECRET
  .env 已在 .gitignore 中，不会提交真实密码和 API Key

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
node --check dist/app.js 通过

本地验证：
  GET / 未登录 -> 302 /login?next=%2F
  GET /api/state 未登录 -> 401
  GET /api/health -> 200
  POST /api/login 正确账号密码 -> 200
  GET /api/state 带 Cookie -> 200
  GET /api/logout -> 405
  POST /api/logout -> 200
  logout 后 GET / -> 302 /login?next=%2F
  登录后首页包含「退出登录」

公网 quick tunnel 验证：
  GET / 未登录最终进入 /login
  GET /api/state 未登录 -> 401
  GET /api/health -> 200
  POST /api/login 正确账号密码 -> 200
  GET /api/state 带 Cookie -> 200
```

当前公网临时地址：

```text
https://writers-limited-fortune-researchers.trycloudflare.com
```

注意：

```text
quick tunnel 是临时地址，cloudflared 或本机服务停止后会失效。
正式长期访问建议使用 Cloudflare named tunnel 并绑定域名。
```

## 2026-07-02 AI 识别长耗时断连修复

用户反馈：

```text
后台日志显示视觉模型识别成功，但前端卡片仍显示「待确认 · 0%」。
```

问题判断：

```text
后端日志中出现真实成功记录：
  [AI] file="wx_camera_1782887672388.jpg" recommended=lulu column=source confidence=0.9 duration=104872ms

但这次请求耗时约 105 秒。
通过 Cloudflare Tunnel / 外网访问时，长请求容易在 100 秒附近被浏览器、代理或 tunnel 断开。
结果是：
  后端最终调用 Qwen 成功
  前端 fetch 已经断开，收不到成功响应
  前端 catch 分支执行 makeFailedAnalysisAsset
  卡片被改成 pending / 0%

所以不是模型没识别，而是同步请求太久导致前端收不到结果。
```

已调整：

```text
server.js
  新增内存级 AI 识别任务表 aiJobs
  新增 AI_JOB_TTL_MS，默认 30 分钟清理任务
  新增 POST /api/analyze-image-jobs
    读取上传 JSON 后立即创建 jobId
    返回 202 + jobId
    后台异步调用 qwen-vl-plus 与 qwen-plus
  新增 GET /api/analyze-image-jobs/:jobId
    返回 processing / completed / failed
    completed 时返回 analysis
  后台任务成功日志新增 async=true
  保留旧 POST /api/analyze-image 同步接口，便于兼容和调试

app.js
  analyzeUploadedImage 改为优先调用 POST /api/analyze-image-jobs
  前端拿到 jobId 后轮询 GET /api/analyze-image-jobs/:jobId
  completed 后再更新素材标题、标签、项目、画布列和置信度
  failed 才进入待确认兜底
  如果新接口返回 404，会降级到旧同步 /api/analyze-image
  处理中素材文案改为「后台正在识别」，避免用户误解为卡死

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
node --check dist/app.js 通过

本地异步识别测试：
  POST /api/analyze-image-jobs -> 202 processing + jobId
  GET /api/analyze-image-jobs/:jobId -> processing
  GET /api/analyze-image-jobs/:jobId -> completed
  返回 title = 紫色块状图形素材

后台日志：
  [AI] 2026-07-02T03:19:19.605Z async=true vision=qwen-vl-plus classifier=qwen-plus file="async-job-purple-block.png" recommended=unassigned column=source confidence=0.6 duration=4135ms
```

## 2026-07-02 待确认旧失败卡片排查

用户反馈：

```text
刷新后画布里仍然出现多张「待确认 · 0%」卡片，例如「已生成图像 1 / 3」。
```

排查结论：

```text
当前后台日志没有这些新卡片对应的 async=true AI 成功记录。
data/state.json 中也没有「已生成图像 1 / 3」这些素材。
说明这些卡片大概率来自浏览器旧 localStorage 或旧页面内存状态，而不是当前后端状态。

旧同步识别版本在长请求断连后会进入 catch：
  makeFailedAnalysisAsset
  status = pending
  score = 0
  thumbnail = 待确认占位图

因此旧失败素材会显示成：
  待确认 · 0%
并且缩略图被替换成“待确认”占位图，容易误以为是 AI 识别成功后仍然待确认。
```

已调整：

```text
index.html
  资源版本从 20260702-auth-login 更新为 20260702-async-jobs
  让浏览器刷新后更明确地拉取新 app.js

app.js
  hydrateBackendState 如果 GET /api/state 返回 401，直接跳 /login
  scheduleBackendStateSave 如果 PUT /api/state 返回 401，直接跳 /login
  新增 redirectToLogin
  图片识别失败时不再覆盖原图 thumbnail，保留用户上传的图片预览
  音频 / 视频失败仍使用对应类型占位图

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

操作建议：

```text
如果页面仍显示旧「待确认 · 0%」卡片，先强制刷新浏览器。
这些旧失败卡片不会自动变成 AI 成功结果，因为旧请求当时前端已经丢失了返回值。
需要删除旧失败卡片后重新上传，或后续增加“重新识别”按钮。
```

## 2026-07-02 浏览器本地缓存重新同步按钮

用户反馈：

```text
公网页面看起来操作还是一样，怀疑没有更新。
```

排查结果：

```text
带登录 Cookie 访问公网 quick tunnel，确认已经返回新版本：
  styles.css?v=20260702-async-jobs
  app.js?v=20260702-async-jobs
  页面包含「退出登录」
  app.js 包含 /api/analyze-image-jobs

后端 /api/state 当前没有用户截图里的「已生成图像 1 / 3」标题。
因此这些卡片主要来自浏览器旧 localStorage 或旧页面内存状态。
```

已调整：

```text
index.html
  顶部操作区新增「重新同步」按钮
  资源版本更新到 20260702-resync

app.js
  新增 resyncButton
  新增 resyncFromBackend
  点击「重新同步」后：
    清除浏览器 localStorage 中的 photoManage.mvp.v1
    取消待保存的后端同步计时器
    GET /api/state 重新拉取后端状态
    用后端状态覆盖当前页面内存状态
    重新写入 localStorage
    render 并显示 toast「已重新同步后端状态」
  如果 /api/state 返回 401，直接跳转登录页

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过

公网 quick tunnel 已返回：
  styles.css?v=20260702-resync
  app.js?v=20260702-resync
  页面包含「重新同步」按钮
```

## 2026-07-02 后端资产状态主导

用户要求：

```text
不需要「重新同步」功能。
改成底层解决：
1. 移除重新同步按钮
2. 新增接口
3. 上传后先创建后端 asset，再跑 AI job
4. 前端不再把 state.assets 当主数据源保存到 localStorage
5. 旧 pending · 0% 失败素材改为 failed，显示「重新识别」，同时不要用待确认蒙版，还是显示原图片
```

已调整：

```text
index.html
  移除「重新同步」按钮
  状态筛选新增「识别失败」
  资源版本更新到 20260702-assets-api

server.js
  新增 GET /api/assets
  新增 POST /api/assets
    前端上传后先创建后端 asset
    后端返回 asset，status 初始为 processing
  新增 PATCH /api/assets/:id
    用于确认归档、手动归档、移入待确认等单素材更新
  新增 DELETE /api/assets/:id
    删除后端素材并清理 canvasLayouts 中的布局记录
  新增 POST /api/assets/:id/analyze
    基于已存在 asset 创建 AI 识别 job
    job 会绑定 assetId
  /api/analyze-image-jobs/:jobId 返回 assetId 和后端最新 asset
  AI job completed 时：
    根据 Qwen 分析结果更新后端 asset 的 title / description / tags / recommendedProjectId / canvasColumnId / score / status
    保留原 thumbnail / audioSrc / videoSrc
  AI job failed 时：
    后端 asset.status = failed
    score = 0
    description = AI 识别失败，原图已保留，可重新识别或手动归档
    不覆盖 thumbnail
  /api/state 写入时按 updatedAt 合并 assets，避免旧前端状态覆盖新的 AI job 结果
  sanitizeStoredAsset 会把旧 pending + score 0 + 识别失败文案迁移成 failed

app.js
  localStorage 不再保存 state.assets
  loadState 从 localStorage 只恢复项目、画布、反馈等 UI / 配置状态，assets 为空
  hydrateBackendState 从 /api/state 拉取后端 assets 作为页面主数据源
  saveState 写 localStorage 时移除 assets，只把完整状态保存到后端
  上传图片流程改为：
    FileReader 读取原图 data URL
    buildPendingUploadAsset
    POST /api/assets 创建后端 asset
    前端渲染后端返回 asset
    POST /api/assets/:id/analyze 启动 AI job
    轮询 /api/analyze-image-jobs/:jobId
    completed/failed 后用后端返回 asset 更新前端
  音频 / 视频也先创建后端 asset
  failed 状态显示：
    状态 = 识别失败
    分数区域 = 可重试
    主按钮 = 重新识别
    次按钮 = 手动归档
  新增 retryAssetAnalysis：
    使用保留的原图 thumbnail 重新调用 /api/assets/:id/analyze
  旧 pending · 0% 且包含识别失败文案的素材自动迁移为 failed
  旧失败素材如果只有“待确认”占位图，会改成“识别失败”占位图
  新上传图片失败不再替换原图 thumbnail
  确认归档 / 移入待确认 / 删除素材改为调用后端资产接口

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check server.js 通过
node --check app.js 通过
node --check dist/app.js 通过

本地完整资产链路测试：
  POST /api/assets -> 201，返回 processing asset
  POST /api/assets/:id/analyze -> 202，返回 jobId
  GET /api/analyze-image-jobs/:jobId -> processing
  GET /api/analyze-image-jobs/:jobId -> completed，返回同一个 asset
  后端 asset title 更新为「绿色方块基础素材」
  测试 asset 已通过 DELETE /api/assets/:id 清理

后台日志：
  [AI] 2026-07-02T06:44:22.409Z async=true vision=qwen-vl-plus classifier=qwen-plus file="asset-api-green-block.png" recommended=unassigned column=source confidence=0.7 duration=4275ms

公网 quick tunnel 已返回：
  styles.css?v=20260702-assets-api
  app.js?v=20260702-assets-api
  状态筛选包含「识别失败」
  页面不再包含「重新同步」
```

## 2026-07-02 失败态保留原图显示

用户反馈：

```text
识别失败时不希望显示「识别失败」占位图，希望仍然显示原图片。
```

问题判断：

```text
旧版本失败时会把 thumbnail 替换成「待确认」或「识别失败」占位图。
如果旧失败素材已经被覆盖，后端状态里只剩占位 SVG，无法从占位图反推出原图。
但新上传素材可以通过额外保存 originalSrc 来保证失败后仍显示原图。
```

已调整：

```text
server.js
  sanitizeStoredAsset 显式保留 originalSrc 字段

app.js
  buildPendingUploadAsset 为图片保存：
    thumbnail = 原图 data URL
    originalSrc = 原图 data URL
  后端 asset 更新和 AI job 更新时保留 originalSrc
  renderAssets / renderCanvas 改为使用 getAssetImageSource
  getAssetImageSource 规则：
    failed 且 originalSrc 存在时，优先显示 originalSrc
    否则显示 thumbnail
  retryAssetAnalysis 改为使用 getAssetImageSource
  copyAssetImage 改为复制 getAssetImageSource
  移除 failed 状态把 thumbnail 替换成「识别失败」占位图的逻辑
  isGeneratedPlaceholder 会识别旧「待确认 / 识别失败」占位图，避免拿占位图重新识别

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

注意：

```text
旧失败素材如果当时已经被旧代码覆盖成占位图，且没有 originalSrc，无法自动恢复原图。
这类旧素材需要删除后重新上传。
新上传素材从此失败也会保留原图片显示。
```

## 2026-06-24 图片素材误显示播放器修复

用户反馈：

```text
每个素材都有播放控件。
预期只有音频和后续视频素材才支持播放。
```

问题判断：

```text
index.html 模板中的 audio 元素默认带 hidden。
但 styles.css 里 .asset-audio / .canvas-asset-audio 设置了 display:block。
类选择器覆盖了浏览器默认 hidden 行为，导致图片卡片里隐藏的 audio 也显示出来。
```

已调整：

```text
styles.css
  新增：
    .asset-audio[hidden],
    .canvas-asset-audio[hidden] {
      display: none;
    }

index.html
  资源版本更新到 20260624-audio-hidden，避免继续读取旧 CSS

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000 返回 HTTP/1.1 200 OK
页面源码确认加载 20260624-audio-hidden
```

## 2026-06-24 MP4 视频素材上传支持

用户反馈：

```text
上传 mp4 没有任何反应。
```

问题判断：

```text
上传入口 accept 只包含 image/*,audio/*。
handleFiles 也只过滤 image/audio。
所以 video/mp4 会被浏览器文件选择和前端过滤逻辑直接排除，不会进入素材队列。
```

已调整：

```text
index.html
  fileInput accept 改为 image/*,audio/*,video/*
  上传区文案改为支持图片 / 声音 / 视频
  assetCardTemplate 新增 asset-video 播放器
  canvasAssetTemplate 新增 canvas-asset-video 播放器
  资源版本更新到 20260624-video-assets

styles.css
  新增 asset-video / canvas-asset-video 样式
  hidden 规则覆盖视频播放器，避免非视频素材显示播放器

app.js
  handleFiles 支持 video/*
  新增 isVideoFile / isVideoAsset
  新增 analyzeUploadedVideo
  新增 makeVideoAssetFromAnalysis
  新增 makeVideoThumb
  readMediaDuration 支持 video 元数据时长读取
  video 素材：
    type = video
    videoSrc = data URL
    canvasColumnId = output
    自动进入「输出结果」列
    首页和画布卡片显示 video controls
    隐藏复制图片按钮
  normalizeAssets 兼容 videoSrc 旧数据
  inferCanvasColumnId 对 video 直接返回 output

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000 返回 HTTP/1.1 200 OK
页面源码确认：
  accept="image/*,audio/*,video/*"
  asset-video / canvas-asset-video 存在
  资源版本 20260624-video-assets
```

## 2026-06-24 视频卡片占位封面移除

用户反馈：

```text
视频卡片上半部分的「视频」方片是多余的。
真实 MP4 播放器已经显示在下方，不应该再显示占位封面。
```

问题判断：

```text
视频模板中同时存在 img 占位图和 video 播放器。
renderCanvas / renderAssets 对 video 素材显示了播放器，但没有隐藏 img。
因此视频素材会出现上方占位封面 + 下方真实播放器的重复媒体区。
```

已调整：

```text
app.js
  renderAssets 中 video 素材设置 thumb.hidden = true
  renderCanvas 中 video 素材设置 canvas-asset-image.hidden = true

styles.css
  新增：
    .thumb[hidden],
    .canvas-asset-image[hidden] {
      display: none;
    }

index.html
  资源版本更新到 20260624-video-clean

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000 返回 HTTP/1.1 200 OK
页面源码确认加载 20260624-video-clean
```

## 2026-06-29 画布双指滑动平移

用户反馈：

```text
希望 Mac 双指滑动时自由画布能往下 / 往左右跑，方便看见下面的素材。
```

已调整：

```text
app.js
  canvasRuntime 新增 wheelSaveTimer
  canvasViewport 新增 wheel 监听：
    els.canvasViewport.addEventListener("wheel", handleCanvasWheelPan, { passive: false })
  新增 handleCanvasWheelPan：
    activeView=canvas 时拦截 wheel
    双指上下滑动修改 layout.panY
    双指左右滑动修改 layout.panX
    ctrlKey 时忽略，避免触控板捏合缩放被当成平移
    audio / video / select / textarea 上滚动时不抢事件
    调用 applyCanvasTransform 即时移动画布
    调用 renderCanvasMinimap 同步小地图视口
    180ms 防抖 saveState，避免高频写 localStorage

index.html
  画布提示文案更新为「双指滑动或拖动画布空白处平移」
  资源版本更新到 20260629-trackpad-pan

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000 返回 HTTP/1.1 200 OK
页面源码确认加载 20260629-trackpad-pan
```

## 2026-07-02 后端状态持久化与 Cloudflare Tunnel

用户需求：

```text
实现后端逻辑，并部署到 Cloudflare Tunnel，方便外网访问。
```

实现范围：

```text
在不引入数据库的前提下，先补一个轻量后端状态层。
项目、素材、画布布局、反馈记录仍沿用当前前端数据结构。
后端用本地 JSON 文件持久化，方便外网访问时多浏览器共享同一份状态。
```

已调整：

```text
server.js
  新增 dataDir = data/
  新增 stateFile = data/state.json
  新增 MAX_STATE_JSON_BYTES，默认 200MB
  新增 GET /api/health
  新增 GET /api/state
  新增 PUT /api/state
  新增 handleState
  新增 readStoredState / writeStoredState / sanitizeStoredState
  writeStoredState 使用临时文件 + rename，降低写坏状态文件风险
  readJsonBody 支持自定义请求体大小和错误文案
  CORS allow-methods 增加 GET / PUT

app.js
  新增 backendSync
  新增 hydrateBackendState
  新增 scheduleBackendStateSave
  新增 normalizeStoredState
  新增 getApiBaseUrl
  启动后先本地渲染，再异步 GET /api/state
  后端有状态时合并到当前 state 并重新渲染
  后端无状态时把当前 state 通过 PUT /api/state 初始化到后端
  saveState 继续保存 localStorage，同时防抖同步到后端
  后端状态过大写不进 localStorage 时，当前会话仍使用内存 state
  analyzeUploadedImage 改为复用 getApiBaseUrl

.gitignore
  新增 data/
  新增 .tools/
  继续忽略 .env 和 photoManage-cloudflare-pages.zip

README.md
  新增后端状态持久化说明
  新增 /api/state /api/health 说明
  新增 quick tunnel 临时访问说明

index.html
  资源版本更新到 20260702-backend-state

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

Cloudflare Tunnel：

```text
GitHub release 下载 cloudflared 速度为 0，改用 pnpm dlx cloudflared 安装包装包。
包装包安装后实际 cloudflared 路径：
  ~/Library/pnpm/store/.../node_modules/cloudflared/bin/cloudflared

已启动 quick tunnel：
  https://writers-limited-fortune-researchers.trycloudflare.com

说明：
  这是 trycloudflare.com 临时地址，不保证长期固定。
  终端里的 cloudflared 进程停止后，公网地址会失效。
  正式长期访问建议创建 Cloudflare named tunnel 并绑定自定义域名。
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
本地：
  GET http://localhost:3000/api/health 返回 ok=true
  GET http://localhost:3000/api/state 返回 state=null
公网：
  GET https://writers-limited-fortune-researchers.trycloudflare.com 返回 200
  GET /api/health 返回 ok=true
  PUT /api/state 测试写入成功
  GET /api/state 测试读取成功
测试状态已删除，等待真实浏览器访问后初始化后端状态
```

## 2026-06-23 画布素材磁力避让布局

用户反馈：

```text
素材识别后转移到正确列，但很容易被原有素材遮挡。
希望素材之间像磁力一样排斥，不能重叠在一起。
```

产品设计：

```text
画布素材卡片拥有固定碰撞盒。
自动入列、识别完成换列、整理素材、手动拖动释放时，都执行列内排斥。
拖动中的素材作为锚点，尽量保留用户释放的位置；同列里发生重叠的其它素材会向下让开。
```

已调整：

```text
app.js
  CANVAS_LAYOUT_VERSION 升级到 5
  新增 CANVAS_ASSET_WIDTH / HEIGHT / GAP / TOP_OFFSET 常量
  ensureCanvasAssetPositions 不再用简单 slot * 250 固定排布
  新增 findFreeCanvasAssetPosition：
    按目标列已有卡片碰撞盒寻找第一个空位
  新增 resolveCanvasAssetCollisions：
    同列素材按矩形碰撞检测自动向下避让
    拖动释放时以被拖动素材为锚点，其它素材让开
    自动卡片会回到列内居中 x，手动拖动卡片保留用户 x
    素材变多时自动拉长列高
  tidyCanvasAssets 改为使用空位查找和碰撞解决
  stopCanvasPointer 在素材拖动结束后触发排斥并重新渲染
  getCanvasContentBounds 改为使用素材尺寸常量

index.html
  画布提示文案新增「卡片会自动避让」
  资源版本更新到 20260623-magnetic-layout，避免旧 app.js 缓存

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
本地排斥逻辑测试：
  三张同列重叠素材自动排为 y=198 / 446 / 694
  hasOverlap=false
本地服务：
  http://localhost:3000 返回 HTTP/1.1 200 OK
```

## 2026-06-23 声音素材与音色列支持

用户需求：

```text
支持上传声音素材，并在项目画布分组里新增「音色」这一列。
声音素材仍然属于同一个项目素材库，不另起系统管理。
```

产品设计：

```text
统一素材库，多素材类型。
asset.type 支持：
  image
  audio

图片素材继续走 Qwen 视觉识别链路。
声音素材先走本地元数据链路：
  读取文件名、格式、时长
  自动生成标题、描述、标签
  自动进入 voice / 音色列

后续如果接音频识别、转写或音乐理解模型，只需要替换 analyzeUploadedAudio。
```

已调整：

```text
index.html
  fileInput accept 从 image/* 改为 image/*,audio/*
  上传区文案改为支持图片 / 声音
  assetCardTemplate 新增 asset-audio 播放器
  canvasAssetTemplate 新增 canvas-asset-audio 播放器
  画布提示文案新增音色关系
  资源版本更新到 20260623-audio-assets

app.js
  CANVAS_COLUMNS 新增：
    id = voice
    title = 音色
    hint = BGM、音效、旁白
  output 列右移到 x=1600
  loadState 使用 normalizeAssets 兼容旧素材
  normalizeAssets：
    旧素材默认 type=image
    audio 素材自动补 thumbnail、canvasColumnId=voice、声音素材标签
  handleFiles 支持 image/* 和 audio/*
  图片继续调用 analyzeUploadedImage
  音频调用 analyzeUploadedAudio
  新增 readAudioDuration / formatAudioDuration
  新增 makeAudioAssetFromAnalysis
  新增 makeAudioThumb
  inferCanvasColumnId 对 audio 直接返回 voice
  renderAssets：
    audio 显示播放器
    audio 隐藏复制图片按钮
  renderCanvas：
    audio 显示播放器
    audio 隐藏复制图片按钮
  上传按钮文案从「上传图片」改为「上传素材」

styles.css
  新增 asset-audio / canvas-asset-audio 播放器样式

server.js
  defaultCanvasColumns 新增 voice / 音色
  分类提示词新增：
    BGM、音效、旁白、人声、环境音、音乐参考、音色参考，应放 voice

dist/
  已同步 index.html / styles.css / app.js / _headers

photoManage-cloudflare-pages.zip
  已重新打包
```

验证结果：

```text
node --check app.js 通过
node --check server.js 通过
node --check dist/app.js 通过
dist matches source
curl http://localhost:3000 返回 HTTP/1.1 200 OK
页面源码确认：
  accept="image/*,audio/*"
  资源版本 20260623-audio-assets
  上传区和画布文案包含声音 / 音色
本地服务已重启：
  http://localhost:3000
```
