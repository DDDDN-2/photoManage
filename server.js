const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = __dirname;
loadEnvFile(path.join(root, ".env"));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const qwenApiUrl =
  process.env.QWEN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const qwenVisionModel = process.env.QWEN_VISION_MODEL || "qwen-vl-plus";
const qwenClassifierModel = process.env.QWEN_CLASSIFIER_MODEL || process.env.QWEN_REASONING_MODEL || "qwen-plus";
const maxJsonBytes = Number(process.env.MAX_UPLOAD_JSON_BYTES || 24 * 1024 * 1024);
const defaultCanvasColumns = [
  { id: "source", title: "参考素材", hint: "角色、道具、原始图" },
  { id: "state", title: "角色 / 状态", hint: "表情、造型、姿态" },
  { id: "scene", title: "场景 / 镜头", hint: "环境、分镜、氛围" },
  { id: "voice", title: "音色", hint: "BGM、音效、旁白" },
  { id: "output", title: "输出结果", hint: "视频、成片、待复用" }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/analyze-image") {
    await handleAnalyzeImage(request, response);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  });
});

async function handleAnalyzeImage(request, response) {
  const startedAt = Date.now();
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  if (!process.env.DASHSCOPE_API_KEY) {
    sendJson(response, 503, {
      error: "MISSING_DASHSCOPE_API_KEY",
      message: "请先配置 DASHSCOPE_API_KEY 再启动服务。"
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const analysis = await analyzeImageWithQwen(body);
    console.log(
      `[AI] ${new Date().toISOString()} vision=${qwenVisionModel} classifier=${qwenClassifierModel} file="${String(body.fileName || "untitled")}" recommended=${analysis.recommended_project_id} column=${analysis.canvas_column_id} confidence=${analysis.confidence} duration=${Date.now() - startedAt}ms`
    );
    sendJson(response, 200, { analysis });
  } catch (error) {
    console.error(
      `[AI:ERROR] ${new Date().toISOString()} code=${error.code || "UNKNOWN"} status=${error.statusCode || 500} duration=${Date.now() - startedAt}ms message=${error.publicMessage || error.message}`
    );
    sendJson(response, error.statusCode || 500, {
      error: error.code || "AI_IMAGE_ANALYSIS_FAILED",
      message: error.publicMessage || "图片识别失败，请稍后重试。"
    });
  }
}

async function analyzeImageWithQwen(body) {
  const imageDataUrl = String(body.imageDataUrl || "");
  const fileName = String(body.fileName || "未命名图片");
  const preferredProjectId = body.preferredProjectId || null;
  const projects = normalizeRequestProjects(body.projects);
  const canvasColumns = normalizeCanvasColumns(body.canvasColumns);

  if (!imageDataUrl.startsWith("data:image/")) {
    throw publicError(400, "INVALID_IMAGE", "图片数据格式不正确。");
  }

  const prompt = buildVisionPrompt({ fileName, projects, preferredProjectId });
  const qwenResponse = await fetch(qwenApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: qwenVisionModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object"
      }
    })
  });

  const payload = await qwenResponse.json().catch(() => null);
  if (!qwenResponse.ok) {
    const message = payload?.error?.message || payload?.message || "Qwen 视觉模型调用失败。";
    throw publicError(qwenResponse.status, "QWEN_API_ERROR", message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw publicError(502, "EMPTY_QWEN_RESPONSE", "Qwen 没有返回可解析的识别结果。");
  }

  const analysis = sanitizeAnalysis(parseJsonContent(content), projects);
  analysis.canvas_column_id = "source";
  analysis.canvas_column_reason = "视觉识别阶段不直接决定画布类别。";

  try {
    const category = await classifyCanvasColumnWithQwen({
      analysis,
      projects,
      canvasColumns,
      preferredProjectId
    });
    analysis.canvas_column_id = category.canvas_column_id;
    analysis.canvas_column_reason = category.reason;
  } catch (error) {
    console.error(
      `[AI:COLUMN_ERROR] ${new Date().toISOString()} code=${error.code || "UNKNOWN"} status=${error.statusCode || 500} message=${error.publicMessage || error.message}`
    );
  }

  return analysis;
}

function buildVisionPrompt({ fileName, projects, preferredProjectId }) {
  return `你是一个 AI 图片素材库的视觉识别和归档助手。

请根据图片内容生成结构化 JSON，用于素材自动命名、描述、打标签和推荐归档项目。

文件名：${fileName}
当前上传项目 ID：${preferredProjectId || "无"}

可选项目列表：
${JSON.stringify(projects, null, 2)}

输出必须是 JSON 对象，不要使用 Markdown，不要添加解释文字。字段必须为：
{
  "title": "8到18字中文素材名",
  "description": "一句中文描述，说明主体、场景、风格或用途",
  "tags": ["3到8个中文短标签"],
  "visual_features": {
    "subject": "主体",
    "scene": "场景",
    "style": "视觉风格",
    "colors": ["主色1", "主色2"],
    "usage": "可能用途"
  },
  "recommended_project_id": "项目 id；无法判断时用 unassigned",
  "confidence": 0.0,
  "reason": "推荐理由"
}

推荐规则：
- 只能从项目列表的 id 中选择 recommended_project_id。
- 如果当前上传项目 ID 存在，并且图片明显不冲突，可优先推荐当前项目。
- 如果看不出和任何项目有关，recommended_project_id 返回 "unassigned"，confidence 小于 0.65。
- confidence 取值范围 0 到 1。`;
}

function sanitizeAnalysis(value, projects) {
  const projectIds = new Set(projects.map((project) => project.id));
  const recommendedProjectId = projectIds.has(value.recommended_project_id)
    ? value.recommended_project_id
    : "unassigned";
  const confidence = Number(value.confidence);

  return {
    title: cleanText(value.title, "未命名图片素材").slice(0, 32),
    description: cleanText(value.description, "图片已完成 AI 识别，等待确认归档。"),
    tags: cleanArray(value.tags).slice(0, 8),
    visual_features: {
      subject: cleanText(value.visual_features?.subject, "未知主体"),
      scene: cleanText(value.visual_features?.scene, "未知场景"),
      style: cleanText(value.visual_features?.style, "未知风格"),
      colors: cleanArray(value.visual_features?.colors).slice(0, 5),
      usage: cleanText(value.visual_features?.usage, "素材参考")
    },
    recommended_project_id: recommendedProjectId,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    reason: cleanText(value.reason, "根据图片视觉内容和项目关键词自动推荐。")
  };
}

async function classifyCanvasColumnWithQwen({ analysis, projects, canvasColumns, preferredProjectId }) {
  const prompt = buildCanvasClassifierPrompt({ analysis, projects, canvasColumns, preferredProjectId });
  const qwenResponse = await fetch(qwenApiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: qwenClassifierModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0,
      response_format: {
        type: "json_object"
      }
    })
  });

  const payload = await qwenResponse.json().catch(() => null);
  if (!qwenResponse.ok) {
    const message = payload?.error?.message || payload?.message || "Qwen 类别判断模型调用失败。";
    throw publicError(qwenResponse.status, "QWEN_CLASSIFIER_ERROR", message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw publicError(502, "EMPTY_QWEN_CLASSIFIER_RESPONSE", "Qwen 没有返回可解析的类别判断结果。");
  }

  return sanitizeCanvasClassification(parseJsonContent(content), canvasColumns);
}

function buildCanvasClassifierPrompt({ analysis, projects, canvasColumns, preferredProjectId }) {
  return `你是图片素材库的项目画布分类助手。

任务：根据视觉识别结果，判断这张图片应该放入当前项目画布的哪个类别框。

当前上传项目 ID：${preferredProjectId || "无"}

项目列表：
${JSON.stringify(projects, null, 2)}

当前项目画布已有类别：
${JSON.stringify(canvasColumns, null, 2)}

图片视觉识别结果：
${JSON.stringify(analysis, null, 2)}

分类原则：
- 只能从“当前项目画布已有类别”的 id 中选择 canvas_column_id。
- 先判断图片主主体，再判断背景；不要因为识别结果里出现“场景”两个字就放入 scene。
- 不要因为图片是 AI 生成图就放入 output。
- output 只用于视频、成片、最终交付结果、待复用输出物。
- BGM、音效、旁白、人声、环境音、音乐参考、音色参考，应放 voice。
- 单个 IP 角色、动物角色、人物、卡通形象、角色设定、玩偶形象、表情、姿态、服装造型，应放 state。
- 静态场景图、背景图、环境图、游乐园、旋转木马、房间、建筑，应放 scene。
- 道具、配饰、头饰、发箍、玩具、船、单个非角色物体、原始参考图，应放 source。
- 如果不确定，选择最有助于后续创作整理的类别，而不是 output。

只返回 JSON，不要使用 Markdown：
{
  "canvas_column_id": "类别 id",
  "confidence": 0.0,
  "reason": "一句话说明为什么放入这个类别"
}`;
}

function sanitizeCanvasClassification(value, canvasColumns) {
  const validIds = new Set(canvasColumns.map((column) => column.id));
  const id = validIds.has(value.canvas_column_id) ? value.canvas_column_id : "source";
  const confidence = Number(value.confidence);

  return {
    canvas_column_id: id,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    reason: cleanText(value.reason, "根据当前项目画布类别自动归入。")
  };
}

function parseJsonContent(content) {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw publicError(502, "INVALID_QWEN_JSON", "Qwen 返回结果不是有效 JSON。");
    return JSON.parse(match[0]);
  }
}

function normalizeRequestProjects(projects) {
  const source = Array.isArray(projects) ? projects : [];
  const normalized = source
    .filter((project) => project?.id && project?.name)
    .map((project) => ({
      id: String(project.id),
      name: String(project.name),
      description: String(project.description || ""),
      keywords: Array.isArray(project.keywords) ? project.keywords.map(String).slice(0, 12) : []
    }));

  if (!normalized.some((project) => project.id === "unassigned")) {
    normalized.push({
      id: "unassigned",
      name: "待确认项目",
      description: "无法稳定判断归属的图片素材。",
      keywords: ["待确认", "低置信度"]
    });
  }

  return normalized;
}

function normalizeCanvasColumns(columns) {
  const source = Array.isArray(columns) && columns.length ? columns : defaultCanvasColumns;
  const normalized = source
    .filter((column) => column?.id && column?.title)
    .map((column) => ({
      id: String(column.id),
      title: String(column.title),
      hint: String(column.hint || "")
    }));

  return normalized.length ? normalized : defaultCanvasColumns;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxJsonBytes) {
        reject(publicError(413, "REQUEST_TOO_LARGE", "图片太大，请先压缩后再上传。"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(publicError(400, "INVALID_JSON", "请求 JSON 格式不正确。"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

function publicError(statusCode, code, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function cleanText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: PORT=${port + 1} node server.js`);
    process.exit(1);
  }

  if (error.code === "EPERM") {
    console.error(`Cannot listen on ${host}:${port}. Run this command in a normal terminal, or allow network binding.`);
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  const urls = [`http://localhost:${port}`];
  for (const item of Object.values(os.networkInterfaces()).flat()) {
    if (item && item.family === "IPv4" && !item.internal) {
      urls.push(`http://${item.address}:${port}`);
    }
  }

  console.log(`AI photo library is running on ${host}:${port}`);
  console.log("Open:");
  urls.forEach((url) => console.log(`  ${url}`));
});
