const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

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
const databaseFile = path.join(dataDir, "photo-manage.sqlite");
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

const db = initDatabase();

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

  if (url.pathname === "/api/assets") {
    await handleAssets(request, response);
    return;
  }

  if (url.pathname === "/api/ai-jobs") {
    handleAiJobs(request, response, url);
    return;
  }

  const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
  if (assetMatch) {
    await handleAsset(request, response, decodeURIComponent(assetMatch[1]));
    return;
  }

  const assetAnalyzeMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/analyze$/);
  if (assetAnalyzeMatch) {
    await handleAssetAnalyze(request, response, decodeURIComponent(assetAnalyzeMatch[1]));
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
      const previousState = readStoredStateOrDefault();
      const state = sanitizeStoredState(body.state || body);
      state.assets = previousState.assets;
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

function initDatabase() {
  fs.mkdirSync(dataDir, { recursive: true });
  const database = new DatabaseSync(databaseFile);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ui_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      deleted_project_ids TEXT NOT NULL DEFAULT '[]',
      projects TEXT NOT NULL DEFAULT '[]',
      canvas_layouts TEXT NOT NULL DEFAULT '{}',
      feedback TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      asset_id TEXT,
      type TEXT NOT NULL DEFAULT 'image_analysis',
      status TEXT NOT NULL,
      vision_model TEXT,
      classifier_model TEXT,
      file_name TEXT,
      recommended_project_id TEXT,
      canvas_column_id TEXT,
      confidence REAL,
      duration_ms INTEGER,
      error_code TEXT,
      error_status INTEGER,
      error_message TEXT,
      request_summary TEXT NOT NULL DEFAULT '{}',
      response_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_assets_sort_order ON assets(sort_order);
    CREATE INDEX IF NOT EXISTS idx_assets_updated_at ON assets(updated_at);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_asset_id ON ai_jobs(asset_id);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_created_at ON ai_jobs(created_at);
  `);
  migrateStateJsonToDatabase(database);
  markInterruptedAiJobs(database);
  return database;
}

function migrateStateJsonToDatabase(database) {
  const migrated = database.prepare("SELECT value FROM metadata WHERE key = ?").get("state_json_migrated");
  if (migrated?.value === "1" || !fs.existsSync(stateFile)) return;

  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    if (raw.trim()) {
      const state = sanitizeStoredState(JSON.parse(raw));
      writeStoredStateToDatabase(database, state);
      console.log(
        `[DB] ${new Date().toISOString()} migrated ${state.assets.length} assets from data/state.json to ${path.basename(databaseFile)}`
      );
    }
    database
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
      .run("state_json_migrated", "1");
  } catch (error) {
    console.error(`[DB:MIGRATE_ERROR] ${new Date().toISOString()} message=${error.message}`);
  }
}

function markInterruptedAiJobs(database) {
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE ai_jobs
       SET status = 'failed',
           error_code = 'AI_JOB_INTERRUPTED',
           error_status = 500,
           error_message = '服务重启或进程退出导致 AI job 中断。',
           updated_at = ?,
           completed_at = ?
       WHERE status = 'processing'`
    )
    .run(now, now);
}

function readStoredState() {
  return readStoredStateFromDatabase(db);
}

function writeStoredState(state) {
  writeStoredStateToDatabase(db, state);
}

function readStoredStateFromDatabase(database) {
  const stateRow = database.prepare("SELECT * FROM ui_state WHERE id = 1").get();
  const assetRows = database
    .prepare("SELECT data FROM assets ORDER BY sort_order ASC, updated_at DESC, created_at DESC")
    .all();
  if (!stateRow && !assetRows.length) return null;

  return sanitizeStoredState({
    deletedProjectIds: parseJsonValue(stateRow?.deleted_project_ids, []),
    projects: parseJsonValue(stateRow?.projects, []),
    assets: assetRows.map((row) => parseJsonValue(row.data, null)).filter(Boolean),
    canvasLayouts: parseJsonValue(stateRow?.canvas_layouts, {}),
    feedback: parseJsonValue(stateRow?.feedback, []),
    updatedAt: stateRow?.updated_at || null
  });
}

function writeStoredStateToDatabase(database, value) {
  const state = sanitizeStoredState(value);
  const updatedAt = state.updatedAt || new Date().toISOString();

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT OR REPLACE INTO ui_state (
          id,
          deleted_project_ids,
          projects,
          canvas_layouts,
          feedback,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?)`
      )
      .run(
        JSON.stringify(state.deletedProjectIds),
        JSON.stringify(state.projects),
        JSON.stringify(state.canvasLayouts),
        JSON.stringify(state.feedback),
        updatedAt
      );

    database.prepare("DELETE FROM assets").run();
    const insertAsset = database.prepare(
      `INSERT INTO assets (id, data, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    state.assets.forEach((asset, index) => {
      const normalized = sanitizeStoredAsset(asset);
      if (!normalized) return;
      insertAsset.run(
        normalized.id,
        JSON.stringify(normalized),
        index,
        normalized.createdAt,
        normalized.updatedAt
      );
    });

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function parseJsonValue(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function createAiJobRecord(record) {
  const job = normalizeAiJobRecord(record);
  db
    .prepare(
      `INSERT OR REPLACE INTO ai_jobs (
        id,
        asset_id,
        type,
        status,
        vision_model,
        classifier_model,
        file_name,
        recommended_project_id,
        canvas_column_id,
        confidence,
        duration_ms,
        error_code,
        error_status,
        error_message,
        request_summary,
        response_json,
        created_at,
        updated_at,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      job.id,
      job.assetId,
      job.type,
      job.status,
      job.visionModel,
      job.classifierModel,
      job.fileName,
      job.recommendedProjectId,
      job.canvasColumnId,
      job.confidence,
      job.durationMs,
      job.errorCode,
      job.errorStatus,
      job.errorMessage,
      JSON.stringify(job.requestSummary),
      job.responseJson ? JSON.stringify(job.responseJson) : null,
      job.createdAt,
      job.updatedAt,
      job.completedAt
    );
  return job;
}

function updateAiJobRecord(jobId, patch) {
  const existing = readAiJobRecord(jobId);
  if (!existing) return createAiJobRecord({ ...patch, id: jobId });
  return createAiJobRecord({
    ...existing,
    ...patch,
    id: jobId,
    createdAt: existing.createdAt,
    requestSummary: patch.requestSummary || existing.requestSummary
  });
}

function readAiJobRecord(jobId) {
  if (!jobId) return null;
  const row = db.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(String(jobId));
  return row ? mapAiJobRow(row) : null;
}

function listAiJobRecords({ assetId = "", status = "", limit = 50 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const clauses = [];
  const params = [];
  if (assetId) {
    clauses.push("asset_id = ?");
    params.push(String(assetId));
  }
  if (status) {
    clauses.push("status = ?");
    params.push(String(status));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM ai_jobs ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, safeLimit);
  return rows.map(mapAiJobRow);
}

function mapAiJobRow(row) {
  return {
    id: row.id,
    assetId: row.asset_id || null,
    type: row.type,
    status: row.status,
    visionModel: row.vision_model || null,
    classifierModel: row.classifier_model || null,
    fileName: row.file_name || "",
    recommendedProjectId: row.recommended_project_id || null,
    canvasColumnId: row.canvas_column_id || null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    errorCode: row.error_code || null,
    errorStatus: row.error_status == null ? null : Number(row.error_status),
    errorMessage: row.error_message || null,
    requestSummary: parseJsonValue(row.request_summary, {}),
    responseJson: parseJsonValue(row.response_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
  };
}

function normalizeAiJobRecord(value) {
  const now = new Date().toISOString();
  const job = value && typeof value === "object" ? value : {};
  return {
    id: String(job.id || crypto.randomUUID()),
    assetId: job.assetId ? String(job.assetId) : null,
    type: String(job.type || "image_analysis"),
    status: ["processing", "completed", "failed"].includes(job.status) ? job.status : "processing",
    visionModel: String(job.visionModel || qwenVisionModel),
    classifierModel: String(job.classifierModel || qwenClassifierModel),
    fileName: String(job.fileName || "untitled"),
    recommendedProjectId: job.recommendedProjectId ? String(job.recommendedProjectId) : null,
    canvasColumnId: job.canvasColumnId ? String(job.canvasColumnId) : null,
    confidence: Number.isFinite(Number(job.confidence)) ? Number(job.confidence) : null,
    durationMs: Number.isFinite(Number(job.durationMs)) ? Number(job.durationMs) : null,
    errorCode: job.errorCode ? String(job.errorCode) : null,
    errorStatus: Number.isFinite(Number(job.errorStatus)) ? Number(job.errorStatus) : null,
    errorMessage: job.errorMessage ? String(job.errorMessage).slice(0, 2000) : null,
    requestSummary: job.requestSummary && typeof job.requestSummary === "object" ? job.requestSummary : {},
    responseJson: job.responseJson && typeof job.responseJson === "object" ? job.responseJson : null,
    createdAt: typeof job.createdAt === "string" ? job.createdAt : now,
    updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : now,
    completedAt: typeof job.completedAt === "string" ? job.completedAt : null
  };
}

function summarizeAiRequest(body) {
  const imageDataUrl = String(body?.imageDataUrl || "");
  return {
    fileName: String(body?.fileName || "untitled"),
    preferredProjectId: body?.preferredProjectId ? String(body.preferredProjectId) : null,
    projectCount: Array.isArray(body?.projects) ? body.projects.length : 0,
    canvasColumnCount: Array.isArray(body?.canvasColumns) ? body.canvasColumns.length : 0,
    hasImageDataUrl: imageDataUrl.startsWith("data:image/"),
    imageBytesApprox: imageDataUrl ? Math.round(imageDataUrl.length * 0.75) : 0
  };
}

function sanitizeStoredState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    deletedProjectIds: Array.isArray(state.deletedProjectIds) ? state.deletedProjectIds.map(String) : [],
    projects: Array.isArray(state.projects) ? state.projects : [],
    assets: Array.isArray(state.assets) ? state.assets.map(sanitizeStoredAsset).filter(Boolean) : [],
    canvasLayouts: state.canvasLayouts && typeof state.canvasLayouts === "object" ? state.canvasLayouts : {},
    feedback: Array.isArray(state.feedback) ? state.feedback : [],
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null
  };
}

function sanitizeStoredAsset(value) {
  if (!value || typeof value !== "object") return null;
  const asset = { ...value };
  asset.id = String(asset.id || crypto.randomUUID());
  asset.type = ["image", "audio", "video"].includes(asset.type) ? asset.type : "image";
  asset.title = String(asset.title || "未命名素材");
  asset.description = String(asset.description || "");
  asset.tags = Array.isArray(asset.tags) ? asset.tags.map(String).filter(Boolean).slice(0, 12) : [];
  asset.projectId = asset.projectId ? String(asset.projectId) : null;
  asset.recommendedProjectId = String(asset.recommendedProjectId || "unassigned");
  asset.score = clampNumber(Number(asset.score), 0, 1, 0);
  asset.reason = String(asset.reason || "");
  asset.status = normalizeAssetStatus(asset);
  asset.thumbnail = String(asset.thumbnail || "");
  asset.originalSrc = String(asset.originalSrc || "");
  if (asset.type === "image" && asset.status === "processing" && isStaleProcessingAsset(asset)) {
    asset.status = "failed";
    asset.score = 0;
    asset.title = asset.title === "AI 识别中" ? "识别中断素材" : asset.title;
    asset.description = "AI 识别任务中断，原图已保留，可以点击重识别。";
    asset.reason = "服务重启或连接中断导致 AI job 丢失。";
    asset.updatedAt = new Date().toISOString();
  }
  if (asset.type === "image" && !asset.originalSrc && asset.thumbnail && !isGeneratedPlaceholder(asset.thumbnail)) {
    asset.originalSrc = asset.thumbnail;
  }
  if (asset.type === "image" && asset.status === "failed") {
    if (asset.originalSrc && !isGeneratedPlaceholder(asset.originalSrc)) {
      asset.thumbnail = asset.originalSrc;
    } else if (!asset.thumbnail || isGeneratedPlaceholder(asset.thumbnail)) {
      asset.thumbnail = makeMissingOriginalThumb();
    }
  }
  asset.canvasColumnId = ["source", "state", "scene", "voice", "output"].includes(asset.canvasColumnId)
    ? asset.canvasColumnId
    : "";
  asset.createdAt = typeof asset.createdAt === "string" ? asset.createdAt : new Date().toISOString();
  asset.updatedAt = typeof asset.updatedAt === "string" ? asset.updatedAt : asset.createdAt;
  return asset;
}

function normalizeAssetStatus(asset) {
  const status = String(asset.status || "");
  const failedSignals = `${asset.title || ""} ${asset.description || ""} ${asset.reason || ""} ${(asset.tags || []).join(" ")}`;
  if (
    status === "failed" ||
    (status === "pending" && Number(asset.score) === 0 && /识别失败|AI 识别失败|处理失败/.test(failedSignals))
  ) {
    return "failed";
  }
  return ["processing", "pending", "recommended", "possible", "confirmed"].includes(status) ? status : "pending";
}

function isStaleProcessingAsset(asset) {
  const updatedAt = Date.parse(asset.updatedAt || asset.createdAt || 0) || 0;
  return updatedAt > 0 && Date.now() - updatedAt > 10 * 60 * 1000;
}

function isGeneratedPlaceholder(source) {
  return /%E5%BE%85%E7%A1%AE%E8%AE%A4|%E8%AF%86%E5%88%AB%E5%A4%B1%E8%B4%A5|%E5%8E%9F%E5%9B%BE%E7%BC%BA%E5%A4%B1|待确认|识别失败|原图缺失/.test(String(source || ""));
}

function makeMissingOriginalThumb() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#7a3b35"/>
      <stop offset=".58" stop-color="#d9d2c4"/>
      <stop offset="1" stop-color="#9d6b5d"/>
    </linearGradient>
  </defs>
  <rect width="960" height="720" fill="url(#g)"/>
  <rect x="120" y="120" width="720" height="420" rx="32" fill="rgba(255,255,255,.28)"/>
  <text x="480" y="330" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#fff">原图缺失</text>
  <text x="480" y="410" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,.86)">请删除后重新上传</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readStoredStateOrDefault() {
  return readStoredState() || {
    deletedProjectIds: [],
    projects: [],
    assets: [],
    canvasLayouts: {},
    feedback: [],
    updatedAt: null
  };
}

async function handleAssets(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET") {
    const state = readStoredStateOrDefault();
    sendJson(response, 200, {
      assets: state.assets,
      updatedAt: state.updatedAt
    });
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readJsonBody(request, maxStateJsonBytes, "素材数据太大，请先压缩后再上传。");
      const state = readStoredStateOrDefault();
      const now = new Date().toISOString();
      const asset = sanitizeStoredAsset({
        ...(body.asset || body),
        id: body.asset?.id || body.id || crypto.randomUUID(),
        createdAt: body.asset?.createdAt || body.createdAt || now,
        updatedAt: now
      });

      state.assets = state.assets.filter((item) => item.id !== asset.id);
      state.assets.unshift(asset);
      state.updatedAt = now;
      writeStoredState(state);

      sendJson(response, 201, { asset });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.code || "ASSET_CREATE_FAILED",
        message: error.publicMessage || "创建素材失败。"
      });
    }
    return;
  }

  sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
}

function handleAiJobs(request, response, url) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const jobs = listAiJobRecords({
    assetId: url.searchParams.get("assetId") || "",
    status: url.searchParams.get("status") || "",
    limit: url.searchParams.get("limit") || 50
  });
  sendJson(response, 200, {
    jobs,
    count: jobs.length
  });
}

async function handleAsset(request, response, assetId) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "PATCH") {
    try {
      const body = await readJsonBody(request, 1024 * 1024, "素材更新数据太大。");
      const updated = updateStoredAsset(assetId, (asset) => ({
        ...asset,
        ...(body.asset || body),
        id: asset.id,
        type: body.asset?.type || body.type || asset.type,
        thumbnail: body.asset?.thumbnail || body.thumbnail || asset.thumbnail,
        createdAt: asset.createdAt,
        updatedAt: new Date().toISOString()
      }));
      if (!updated) {
        sendJson(response, 404, {
          error: "ASSET_NOT_FOUND",
          message: "素材不存在。"
        });
        return;
      }
      sendJson(response, 200, { asset: updated });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.code || "ASSET_UPDATE_FAILED",
        message: error.publicMessage || "更新素材失败。"
      });
    }
    return;
  }

  if (request.method === "DELETE") {
    const state = readStoredStateOrDefault();
    const existed = state.assets.some((asset) => asset.id === assetId);
    state.assets = state.assets.filter((asset) => asset.id !== assetId);
    Object.values(state.canvasLayouts || {}).forEach((layout) => {
      if (layout?.items) delete layout.items[assetId];
    });
    state.updatedAt = new Date().toISOString();
    writeStoredState(state);
    sendJson(response, existed ? 200 : 404, existed ? { ok: true } : {
      error: "ASSET_NOT_FOUND",
      message: "素材不存在。"
    });
    return;
  }

  sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
}

async function handleAssetAnalyze(request, response, assetId) {
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
    const state = readStoredStateOrDefault();
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) {
      sendJson(response, 404, {
        error: "ASSET_NOT_FOUND",
        message: "素材不存在，请重新上传。"
      });
      return;
    }

    updateStoredAsset(assetId, (current) => ({
      ...current,
      status: "processing",
      score: 0,
      reason: "后台正在调用视觉模型重新识别。",
      tags: current.tags?.length ? current.tags : ["处理中"],
      updatedAt: new Date().toISOString()
    }));

    const job = createAnalyzeImageJob({
      ...body,
      assetId,
      fileName: body.fileName || asset.title,
      preferredProjectId: body.preferredProjectId || asset.recommendedProjectId,
      imageDataUrl: body.imageDataUrl || asset.originalSrc || asset.thumbnail
    });

    sendJson(response, 202, {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.code || "ASSET_ANALYZE_FAILED",
      message: error.publicMessage || "创建素材识别任务失败。"
    });
  }
}

async function handleAnalyzeImage(request, response) {
  const startedAt = Date.now();
  let logJobId = null;
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
    const createdAt = new Date().toISOString();
    logJobId = crypto.randomUUID();
    createAiJobRecord({
      id: logJobId,
      assetId: body.assetId || null,
      type: "sync_image_analysis",
      status: "processing",
      fileName: body.fileName || "untitled",
      requestSummary: summarizeAiRequest(body),
      createdAt,
      updatedAt: createdAt
    });
    const analysis = await analyzeImageWithQwen(body);
    const completedAt = new Date().toISOString();
    updateAiJobRecord(logJobId, {
      status: "completed",
      recommendedProjectId: analysis.recommended_project_id,
      canvasColumnId: analysis.canvas_column_id,
      confidence: analysis.confidence,
      durationMs: Date.now() - startedAt,
      responseJson: analysis,
      updatedAt: completedAt,
      completedAt
    });
    console.log(
      `[AI] ${new Date().toISOString()} vision=${qwenVisionModel} classifier=${qwenClassifierModel} file="${String(body.fileName || "untitled")}" recommended=${analysis.recommended_project_id} column=${analysis.canvas_column_id} confidence=${analysis.confidence} duration=${Date.now() - startedAt}ms`
    );
    sendJson(response, 200, { analysis });
  } catch (error) {
    if (logJobId) {
      const completedAt = new Date().toISOString();
      updateAiJobRecord(logJobId, {
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: error.code || "AI_IMAGE_ANALYSIS_FAILED",
        errorStatus: error.statusCode || 500,
        errorMessage: error.publicMessage || error.message || "图片识别失败，请稍后重试。",
        updatedAt: completedAt,
        completedAt
      });
    }
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
    const job = createAnalyzeImageJob(body);

    sendJson(response, 202, {
      jobId: job.id,
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
    const storedJob = readAiJobRecord(jobId);
    if (!storedJob) {
      sendJson(response, 404, {
        error: "AI_JOB_NOT_FOUND",
        message: "识别任务不存在或已过期，请重新上传。"
      });
      return;
    }

    sendJson(response, 200, {
      jobId: storedJob.id,
      status: storedJob.status,
      fileName: storedJob.fileName,
      assetId: storedJob.assetId,
      createdAt: storedJob.createdAt,
      updatedAt: storedJob.updatedAt,
      completedAt: storedJob.completedAt,
      analysis: storedJob.status === "completed" ? storedJob.responseJson : null,
      asset: storedJob.status === "completed" || storedJob.status === "failed" ? getStoredAsset(storedJob.assetId) : null,
      error: storedJob.status === "failed" ? storedJob.errorCode || "AI_IMAGE_ANALYSIS_FAILED" : null,
      message: storedJob.status === "failed" ? storedJob.errorMessage || "图片识别失败，请稍后重试。" : null
    });
    return;
  }

  sendJson(response, 200, {
    jobId: job.id,
    status: job.status,
    fileName: job.fileName,
    assetId: job.assetId || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    analysis: job.status === "completed" ? job.analysis : null,
    asset: job.status === "completed" || job.status === "failed" ? getStoredAsset(job.assetId) : null,
    error: job.status === "failed" ? job.error?.code || "AI_IMAGE_ANALYSIS_FAILED" : null,
    message: job.status === "failed" ? job.error?.message || "图片识别失败，请稍后重试。" : null
  });
}

function createAnalyzeImageJob(body) {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = {
    id: jobId,
    assetId: body.assetId ? String(body.assetId) : null,
    status: "processing",
    fileName: String(body.fileName || "untitled"),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    analysis: null,
    error: null
  };
  aiJobs.set(jobId, job);
  createAiJobRecord({
    id: job.id,
    assetId: job.assetId,
    type: "async_image_analysis",
    status: job.status,
    fileName: job.fileName,
    requestSummary: summarizeAiRequest(body),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  });
  runAnalyzeImageJob(job, body);
  return job;
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
      if (job.assetId) {
        const updatedAsset = makeAssetFromAnalysisForStorage(analysis, body.preferredProjectId);
        updateStoredAsset(job.assetId, (asset) => ({
          ...asset,
          ...updatedAsset,
          id: asset.id,
          type: asset.type,
          thumbnail: asset.thumbnail,
          audioSrc: asset.audioSrc,
          videoSrc: asset.videoSrc,
          createdAt: asset.createdAt,
          updatedAt: job.completedAt
        }));
      }
      updateAiJobRecord(job.id, {
        status: "completed",
        recommendedProjectId: analysis.recommended_project_id,
        canvasColumnId: analysis.canvas_column_id,
        confidence: analysis.confidence,
        durationMs: Date.now() - startedAt,
        responseJson: analysis,
        updatedAt: job.completedAt,
        completedAt: job.completedAt
      });
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
      if (job.assetId) {
        updateStoredAsset(job.assetId, (asset) => ({
          ...asset,
          status: "failed",
          score: 0,
          tags: asset.tags?.length ? asset.tags : ["识别失败"],
          description: "AI 识别失败，原图已保留，可重新识别或手动归档。",
          reason: job.error.message,
          updatedAt: job.completedAt
        }));
      }
      updateAiJobRecord(job.id, {
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: job.error.code,
        errorStatus: job.error.statusCode,
        errorMessage: job.error.message,
        updatedAt: job.completedAt,
        completedAt: job.completedAt
      });
      console.error(
        `[AI:ERROR] ${job.completedAt} async=true code=${job.error.code} status=${job.error.statusCode} duration=${Date.now() - startedAt}ms message=${job.error.message}`
      );
    });
}

function getStoredAsset(assetId) {
  if (!assetId) return null;
  return readStoredStateOrDefault().assets.find((asset) => asset.id === assetId) || null;
}

function updateStoredAsset(assetId, updater) {
  const state = readStoredStateOrDefault();
  const index = state.assets.findIndex((asset) => asset.id === assetId);
  if (index === -1) return null;
  const updated = sanitizeStoredAsset(updater(state.assets[index]));
  state.assets[index] = updated;
  state.updatedAt = new Date().toISOString();
  writeStoredState(state);
  return updated;
}

function makeAssetFromAnalysisForStorage(analysis, preferredProjectId = null) {
  const state = readStoredStateOrDefault();
  const projectIds = new Set(state.projects.map((project) => String(project.id)));
  const shouldAutoConfirm = preferredProjectId && preferredProjectId !== "all" && preferredProjectId !== "unassigned";
  const recommendedProjectId = shouldAutoConfirm
    ? preferredProjectId
    : projectIds.has(analysis?.recommended_project_id)
      ? analysis.recommended_project_id
      : "unassigned";
  const score = clampNumber(Number(analysis?.confidence), 0, 1, 0.5);
  const status = shouldAutoConfirm
    ? "confirmed"
    : recommendedProjectId === "unassigned"
      ? "pending"
      : score >= 0.85
        ? "recommended"
        : score >= 0.65
          ? "possible"
          : "pending";

  return {
    title: cleanText(analysis?.title, "AI 识别图片素材"),
    description: cleanText(analysis?.description, "图片已完成 AI 识别，等待确认归档。"),
    tags: cleanArray(analysis?.tags).slice(0, 8),
    visualFeatures: analysis?.visual_features || null,
    canvasColumnId: ["source", "state", "scene", "voice", "output"].includes(analysis?.canvas_column_id)
      ? analysis.canvas_column_id
      : "",
    projectId: shouldAutoConfirm ? preferredProjectId : null,
    recommendedProjectId,
    score,
    reason: cleanText(analysis?.reason, "根据图片视觉内容和项目关键词自动推荐。"),
    status
  };
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
