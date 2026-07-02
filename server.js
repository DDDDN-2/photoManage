const http = require("node:http");
const crypto = require("node:crypto");
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
const maxStateJsonBytes = Number(process.env.MAX_STATE_JSON_BYTES || 200 * 1024 * 1024);
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "state.json");
const authEnabled = process.env.AUTH_ENABLED !== "false";
const authUsername = process.env.ADMIN_USERNAME || process.env.AUTH_USERNAME || "admin";
const authPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || "";
const authSecret = process.env.AUTH_SESSION_SECRET || process.env.ADMIN_PASSWORD || crypto.randomBytes(32).toString("hex");
const authCookieName = "pm_session";
const authMaxAgeSeconds = Number(process.env.AUTH_MAX_AGE_SECONDS || 7 * 24 * 60 * 60);
const authCookieSecure = process.env.AUTH_COOKIE_SECURE === "true";
const aiJobs = new Map();
const aiJobTtlMs = Number(process.env.AI_JOB_TTL_MS || 30 * 60 * 1000);
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

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "photoManage",
      time: new Date().toISOString()
    });
    return;
  }

  if (url.pathname === "/login") {
    sendLoginPage(response);
    return;
  }

  if (url.pathname === "/api/login") {
    await handleLogin(request, response);
    return;
  }

  if (url.pathname === "/api/logout") {
    handleLogout(request, response);
    return;
  }

  if (authEnabled && !isAuthenticated(request)) {
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 401, {
        error: "UNAUTHENTICATED",
        message: "请先登录。"
      });
      return;
    }
    redirectToLogin(response, url.pathname);
    return;
  }

  if (url.pathname === "/api/state") {
    await handleState(request, response);
    return;
  }

  if (url.pathname === "/api/analyze-image-jobs") {
    await handleAnalyzeImageJobCreate(request, response);
    return;
  }

  const analyzeJobMatch = url.pathname.match(/^\/api\/analyze-image-jobs\/([^/]+)$/);
  if (analyzeJobMatch) {
    handleAnalyzeImageJobStatus(request, response, analyzeJobMatch[1]);
    return;
  }

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

function sendLoginPage(response) {
  const configWarning = authEnabled && !authPassword
    ? `<div class="alert">服务端还没有配置 ADMIN_PASSWORD。请先在 .env 里设置账号密码，再重启服务。</div>`
    : "";

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>登录 - AI 图片素材库</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #292520;
      --muted: #756f66;
      --line: #ded6ca;
      --paper: #f7f4ee;
      --panel: #fffdfa;
      --teal: #0f766e;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        linear-gradient(rgba(31, 27, 23, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(31, 27, 23, 0.04) 1px, transparent 1px),
        var(--paper);
      background-size: 32px 32px;
      color: var(--ink);
    }
    main {
      width: min(420px, 100%);
      padding: 30px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 18px 50px rgba(35, 29, 22, 0.08);
    }
    .brand {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      margin-bottom: 18px;
      border-radius: 8px;
      background: #158a7f;
      color: #fff;
      font-weight: 900;
      font-size: 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.15;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 24px;
      color: var(--muted);
      line-height: 1.6;
      font-weight: 650;
    }
    label {
      display: block;
      margin: 16px 0 8px;
      color: var(--muted);
      font-weight: 800;
      font-size: 14px;
    }
    input {
      width: 100%;
      height: 48px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 14px;
      font: inherit;
      font-weight: 750;
      color: var(--ink);
      background: #fff;
    }
    input:focus {
      outline: 3px solid rgba(15, 118, 110, 0.15);
      border-color: var(--teal);
    }
    button {
      width: 100%;
      height: 50px;
      margin-top: 22px;
      border: 1px solid #0b5f58;
      border-radius: 8px;
      background: var(--teal);
      color: #fff;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.72;
    }
    .error, .alert {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 8px;
      line-height: 1.5;
      font-weight: 800;
    }
    .error {
      display: none;
      color: var(--danger);
      background: #fff1ef;
      border: 1px solid #ffd2cc;
    }
    .alert {
      color: #8a4b08;
      background: #fff6d7;
      border: 1px solid #f2d184;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">AI</div>
    <h1>登录素材库</h1>
    <p>外网访问已启用账号密码保护，登录后才能上传、识别和查看资源。</p>
    ${configWarning}
    <form id="loginForm">
      <label for="username">账号</label>
      <input id="username" name="username" autocomplete="username" required autofocus />
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button id="submitButton" type="submit">登录</button>
      <div id="error" class="error"></div>
    </form>
  </main>
  <script>
    const form = document.getElementById("loginForm");
    const button = document.getElementById("submitButton");
    const errorBox = document.getElementById("error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorBox.style.display = "none";
      button.disabled = true;
      button.textContent = "登录中";
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: form.username.value,
            password: form.password.value
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "登录失败。");
        const params = new URLSearchParams(location.search);
        const next = params.get("next") || "/";
        location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      } catch (error) {
        errorBox.textContent = error.message || "登录失败。";
        errorBox.style.display = "block";
      } finally {
        button.disabled = false;
        button.textContent = "登录";
      }
    });
  </script>
</body>
</html>`);
}

async function handleLogin(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  if (!authEnabled) {
    sendJson(response, 200, { ok: true, disabled: true });
    return;
  }

  if (!authPassword) {
    sendJson(response, 503, {
      error: "AUTH_NOT_CONFIGURED",
      message: "服务端未配置 ADMIN_PASSWORD，无法开放登录。"
    });
    return;
  }

  try {
    const body = await readJsonBody(request, 64 * 1024, "登录请求太大。");
    const username = String(body.username || "");
    const password = String(body.password || "");

    if (!safeEqual(username, authUsername) || !safeEqual(password, authPassword)) {
      sendJson(response, 401, {
        error: "INVALID_LOGIN",
        message: "账号或密码不正确。"
      });
      return;
    }

    sendJson(
      response,
      200,
      { ok: true },
      {
        "set-cookie": serializeCookie(authCookieName, createSessionToken(), {
          maxAge: authMaxAgeSeconds
        })
      }
    );
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.code || "LOGIN_FAILED",
      message: error.publicMessage || "登录失败。"
    });
  }
}

function handleLogout(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  sendJson(
    response,
    200,
    { ok: true },
    {
      "set-cookie": serializeCookie(authCookieName, "", {
        maxAge: 0
      })
    }
  );
}

function redirectToLogin(response, nextPath) {
  const safeNext = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  response.writeHead(302, {
    location: `/login?next=${encodeURIComponent(safeNext)}`,
    "cache-control": "no-store"
  });
  response.end();
}

function isAuthenticated(request) {
  if (!authEnabled) return true;
  if (!authPassword) return false;
  const token = parseCookies(request)[authCookieName];
  if (!token) return false;
  return verifySessionToken(token);
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({
      user: authUsername,
      expiresAt: Date.now() + authMaxAgeSeconds * 1000
    })
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, signSessionPayload(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.user === authUsername && Number(session.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", authSecret).update(payload).digest("base64url");
}

function parseCookies(request) {
  const cookies = {};
  String(request.headers.cookie || "")
    .split(";")
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index === -1) return;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!key) return;
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    });
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Number(options.maxAge || 0)}`
  ];
  if (authCookieSecure) parts.push("Secure");
  return parts.join("; ");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function handleState(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET") {
    try {
      const state = readStoredState();
      sendJson(response, 200, {
        state,
        updatedAt: state?.updatedAt || null
      });
    } catch (error) {
      console.error(`[STATE:READ_ERROR] ${new Date().toISOString()} message=${error.message}`);
      sendJson(response, 500, {
        error: "STATE_READ_FAILED",
        message: "读取后端状态失败。"
      });
    }
    return;
  }

  if (request.method === "PUT" || request.method === "POST") {
    try {
      const body = await readJsonBody(request, maxStateJsonBytes, "保存数据太大，请先减少本地视频或改接对象存储。");
      const state = sanitizeStoredState(body.state || body);
      state.updatedAt = new Date().toISOString();
      writeStoredState(state);
      sendJson(response, 200, {
        ok: true,
        updatedAt: state.updatedAt
      });
    } catch (error) {
      console.error(
        `[STATE:WRITE_ERROR] ${new Date().toISOString()} code=${error.code || "UNKNOWN"} status=${error.statusCode || 500} message=${error.publicMessage || error.message}`
      );
      sendJson(response, error.statusCode || 500, {
        error: error.code || "STATE_WRITE_FAILED",
        message: error.publicMessage || "保存后端状态失败。"
      });
    }
    return;
  }

  sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
}

function readStoredState() {
  if (!fs.existsSync(stateFile)) return null;
  const raw = fs.readFileSync(stateFile, "utf8");
  if (!raw.trim()) return null;
  return sanitizeStoredState(JSON.parse(raw));
}

function writeStoredState(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmpFile = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpFile, stateFile);
}

function sanitizeStoredState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    deletedProjectIds: Array.isArray(state.deletedProjectIds) ? state.deletedProjectIds.map(String) : [],
    projects: Array.isArray(state.projects) ? state.projects : [],
    assets: Array.isArray(state.assets) ? state.assets : [],
    canvasLayouts: state.canvasLayouts && typeof state.canvasLayouts === "object" ? state.canvasLayouts : {},
    feedback: Array.isArray(state.feedback) ? state.feedback : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null
  };
}

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

async function handleAnalyzeImageJobCreate(request, response) {
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
    cleanupAiJobs();
    const body = await readJsonBody(request);
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const fileName = String(body.fileName || "untitled");
    const job = {
      id: jobId,
      status: "processing",
      fileName,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      analysis: null,
      error: null
    };
    aiJobs.set(jobId, job);

    runAnalyzeImageJob(job, body);

    sendJson(response, 202, {
      jobId,
      status: job.status,
      createdAt: job.createdAt
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.code || "AI_IMAGE_JOB_CREATE_FAILED",
      message: error.publicMessage || "创建图片识别任务失败。"
    });
  }
}

function handleAnalyzeImageJobStatus(request, response, jobId) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  cleanupAiJobs();
  const job = aiJobs.get(jobId);
  if (!job) {
    sendJson(response, 404, {
      error: "AI_JOB_NOT_FOUND",
      message: "识别任务不存在或已过期，请重新上传。"
    });
    return;
  }

  sendJson(response, 200, {
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    analysis: job.status === "completed" ? job.analysis : null,
    error: job.status === "failed" ? job.error?.code || "AI_IMAGE_ANALYSIS_FAILED" : null,
    message: job.status === "failed" ? job.error?.message || "图片识别失败，请稍后重试。" : null
  });
}

function runAnalyzeImageJob(job, body) {
  const startedAt = Date.now();
  Promise.resolve()
    .then(() => analyzeImageWithQwen(body))
    .then((analysis) => {
      job.status = "completed";
      job.analysis = analysis;
      job.updatedAt = new Date().toISOString();
      job.completedAt = job.updatedAt;
      console.log(
        `[AI] ${job.completedAt} async=true vision=${qwenVisionModel} classifier=${qwenClassifierModel} file="${job.fileName}" recommended=${analysis.recommended_project_id} column=${analysis.canvas_column_id} confidence=${analysis.confidence} duration=${Date.now() - startedAt}ms`
      );
    })
    .catch((error) => {
      job.status = "failed";
      job.error = {
        code: error.code || "AI_IMAGE_ANALYSIS_FAILED",
        statusCode: error.statusCode || 500,
        message: error.publicMessage || error.message || "图片识别失败，请稍后重试。"
      };
      job.updatedAt = new Date().toISOString();
      job.completedAt = job.updatedAt;
      console.error(
        `[AI:ERROR] ${job.completedAt} async=true code=${job.error.code} status=${job.error.statusCode} duration=${Date.now() - startedAt}ms message=${job.error.message}`
      );
    });
}

function cleanupAiJobs() {
  const now = Date.now();
  for (const [jobId, job] of aiJobs.entries()) {
    if (now - Date.parse(job.createdAt) > aiJobTtlMs) {
      aiJobs.delete(jobId);
    }
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

function readJsonBody(request, limitBytes = maxJsonBytes, tooLargeMessage = "图片太大，请先压缩后再上传。") {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limitBytes) {
        reject(publicError(413, "REQUEST_TOO_LARGE", tooLargeMessage));
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

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers
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
