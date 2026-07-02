const STORAGE_KEY = "photoManage.mvp.v1";
const CANVAS_LAYOUT_VERSION = 5;
const CANVAS_ASSET_WIDTH = 190;
const CANVAS_ASSET_HEIGHT = 220;
const CANVAS_ASSET_GAP = 28;
const CANVAS_ASSET_TOP_OFFSET = 102;
const CANVAS_COLUMNS = [
  {
    id: "source",
    title: "参考素材",
    hint: "角色、道具、原始图",
    x: 40,
    y: 96,
    w: 300,
    h: 1320
  },
  {
    id: "state",
    title: "角色 / 状态",
    hint: "表情、造型、姿态",
    x: 430,
    y: 96,
    w: 300,
    h: 1320
  },
  {
    id: "scene",
    title: "场景 / 镜头",
    hint: "环境、分镜、氛围",
    x: 820,
    y: 96,
    w: 300,
    h: 1320
  },
  {
    id: "voice",
    title: "音色",
    hint: "BGM、音效、旁白",
    x: 1210,
    y: 96,
    w: 300,
    h: 1320
  },
  {
    id: "output",
    title: "输出结果",
    hint: "视频、成片、待复用",
    x: 1600,
    y: 96,
    w: 300,
    h: 1320
  }
];

const defaultProjects = [
  {
    id: "lulu",
    name: "噜噜嘟嘟",
    description: "儿童向 IP、圆润 3D 软胶质感、低饱和暖色和玩具道具。",
    keywords: ["噜噜嘟嘟", "圆润线条", "3D软胶", "儿童向", "同IP道具"],
    signals: ["颜色常见橙黄、奶白、浅绿", "主体比例偏圆，边缘柔和", "高频用途为角色场景道具"]
  },
  {
    id: "cyber",
    name: "赛博短片",
    description: "霓虹城市、机械角色、雨夜街道、冷暖撞色和电影感镜头。",
    keywords: ["赛博朋克", "霓虹", "机械", "城市夜景", "短片镜头"],
    signals: ["蓝紫与玫红霓虹占比高", "场景包含街道、屏幕、雨水或金属", "适合短片概念图与分镜参考"]
  },
  {
    id: "ancient",
    name: "古风短剧",
    description: "古装人物、园林、宫墙、道具、传统纹样和柔和戏剧光。",
    keywords: ["古风", "短剧", "服饰", "园林", "传统道具"],
    signals: ["主体多为古装人物或传统场景", "色彩偏朱砂、黛青、米白", "适合角色设定、场景设定和道具归档"]
  },
  {
    id: "unassigned",
    name: "待确认项目",
    description: "低置信度或用户暂不归档的素材，会等待人工确认后反哺画像。",
    keywords: ["待确认", "低置信度", "人工确认"],
    signals: ["置信度低于 0.65", "项目特征不够明确", "用户修改会进入反馈记录"]
  }
];

const sampleAssets = [
  {
    id: "asset-lulu-bed",
    title: "噜噜同 IP 小床",
    description: "圆润体块的小床道具，橙黄和奶白配色，适合作为儿童向角色房间素材。",
    tags: ["噜噜嘟嘟", "同IP道具", "圆润线条", "3D软胶"],
    projectId: null,
    recommendedProjectId: "lulu",
    score: 0.92,
    reason: "与噜噜嘟嘟项目已确认素材在配色、圆润比例和 3D 软胶质感上接近。",
    status: "recommended",
    thumbnail: makeThumb("噜噜", "#f2ad4e", "#f8e7c7", "#6abf9a")
  },
  {
    id: "asset-cyber-alley",
    title: "雨夜霓虹巷口",
    description: "湿润街面反射霓虹灯牌，远处有人物剪影，适合赛博短片氛围图。",
    tags: ["赛博朋克", "霓虹", "雨夜", "城市街道"],
    projectId: null,
    recommendedProjectId: "cyber",
    score: 0.78,
    reason: "城市夜景、霓虹反射和人物剪影与赛博短片画像相符，但缺少明确角色设定。",
    status: "possible",
    thumbnail: makeThumb("CYBER", "#203c6f", "#e04f8b", "#35b7c4")
  },
  {
    id: "asset-ancient-fan",
    title: "古风折扇与玉佩",
    description: "木桌上的折扇、玉佩和绣纹布料，适合古风短剧道具素材。",
    tags: ["古风", "传统道具", "折扇", "玉佩"],
    projectId: "ancient",
    recommendedProjectId: "ancient",
    score: 0.88,
    reason: "道具类型和朱砂、米白、黛青配色与古风短剧项目高度匹配。",
    status: "confirmed",
    thumbnail: makeThumb("古风", "#a34c35", "#e8dcc2", "#42656f")
  },
  {
    id: "asset-uncertain-room",
    title: "未归档室内参考",
    description: "室内局部构图，主体和用途不够明确，建议进入待确认项目。",
    tags: ["室内", "参考图", "低置信度"],
    projectId: null,
    recommendedProjectId: "unassigned",
    score: 0.54,
    reason: "当前素材缺少明确角色、场景或风格锚点，建议人工确认。",
    status: "pending",
    thumbnail: makeThumb("待确认", "#8b8175", "#d9d2c4", "#9d6b5d")
  }
];

const state = loadState();
const editingAssetIds = new Set();
const canvasRuntime = {
  drag: null,
  pan: null,
  resize: null,
  wheelSaveTimer: null
};
const backendSync = {
  hydrating: false,
  saveTimer: null,
  lastSnapshot: ""
};
let activeView = "library";
let activeProject = "all";

const els = {
  projectNav: document.querySelector("#projectNav"),
  projectFilter: document.querySelector("#projectFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  assetGrid: document.querySelector("#assetGrid"),
  canvasArea: document.querySelector("#canvasArea"),
  canvasViewport: document.querySelector("#canvasViewport"),
  canvasWorld: document.querySelector("#canvasWorld"),
  canvasProjectName: document.querySelector("#canvasProjectName"),
  canvasStats: document.querySelector("#canvasStats"),
  canvasZoomReadout: document.querySelector("#canvasZoomReadout"),
  canvasZoomIn: document.querySelector("#canvasZoomIn"),
  canvasZoomOut: document.querySelector("#canvasZoomOut"),
  fitCanvasButton: document.querySelector("#fitCanvasButton"),
  tidyCanvasButton: document.querySelector("#tidyCanvasButton"),
  addGroupButton: document.querySelector("#addGroupButton"),
  addNoteButton: document.querySelector("#addNoteButton"),
  resetCanvasButton: document.querySelector("#resetCanvasButton"),
  canvasMinimap: document.querySelector("#canvasMinimap"),
  emptyState: document.querySelector("#emptyState"),
  template: document.querySelector("#assetCardTemplate"),
  canvasAssetTemplate: document.querySelector("#canvasAssetTemplate"),
  fileInput: document.querySelector("#fileInput"),
  uploadButton: document.querySelector("#uploadButton"),
  dropZone: document.querySelector("#dropZone"),
  seedButton: document.querySelector("#seedButton"),
  logoutButton: document.querySelector("#logoutButton"),
  projectForm: document.querySelector("#projectForm"),
  projectNameInput: document.querySelector("#projectNameInput"),
  projectDescInput: document.querySelector("#projectDescInput"),
  projectKeywordsInput: document.querySelector("#projectKeywordsInput"),
  viewEyebrow: document.querySelector("#viewEyebrow"),
  viewTitle: document.querySelector("#viewTitle"),
  metricAssets: document.querySelector("#metricAssets"),
  metricPending: document.querySelector("#metricPending"),
  metricConfirmed: document.querySelector("#metricConfirmed"),
  metricQuickConfirm: document.querySelector("#metricQuickConfirm"),
  reviewRecommended: document.querySelector("#reviewRecommended"),
  reviewPossible: document.querySelector("#reviewPossible"),
  reviewPending: document.querySelector("#reviewPending"),
  reviewProcessing: document.querySelector("#reviewProcessing"),
  profileName: document.querySelector("#profileName"),
  profileDescription: document.querySelector("#profileDescription"),
  profileTags: document.querySelector("#profileTags"),
  profileSignals: document.querySelector("#profileSignals"),
  feedbackList: document.querySelector("#feedbackList"),
  toast: document.querySelector("#toast")
};

render();
bindEvents();
hydrateBackendState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const normalized = normalizeStoredState(saved);
    if (normalized) return normalized;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return getDefaultState();
}

function getDefaultState() {
  return {
    deletedProjectIds: [],
    projects: structuredClone(defaultProjects),
    assets: normalizeAssets(structuredClone(sampleAssets)),
    canvasLayouts: {},
    feedback: [
      {
        id: "fb-1",
        text: "已确认「古风折扇与玉佩」归档到古风短剧",
        createdAt: new Date().toISOString()
      }
    ]
  };
}

function saveState() {
  let snapshot = "";
  try {
    snapshot = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    console.warn("Local storage quota exceeded; current session still works.");
  }
  scheduleBackendStateSave(snapshot);
}

function normalizeStoredState(saved) {
  if (!saved || !Array.isArray(saved.assets)) return null;
  const deletedProjectIds = repairDeletedProjectIds(saved.deletedProjectIds);
  const projects = normalizeProjects(saved.projects, deletedProjectIds);
  return {
    deletedProjectIds: hasUsableProjects(projects) ? deletedProjectIds : [],
    projects: hasUsableProjects(projects) ? projects : normalizeProjects(defaultProjects, []),
    assets: normalizeAssets(saved.assets),
    feedback: saved.feedback || [],
    canvasLayouts: saved.canvasLayouts || {}
  };
}

function getApiBaseUrl() {
  return localStorage.getItem("photoManage.apiBaseUrl") || "";
}

async function hydrateBackendState() {
  backendSync.hydrating = true;
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/state`, {
      method: "GET",
      cache: "no-store"
    });
    if (response.status === 401) {
      redirectToLogin();
      return;
    }
    if (!response.ok) throw new Error("后端状态读取失败");
    const payload = await response.json();
    const remoteState = normalizeStoredState(payload.state);
    if (remoteState) {
      Object.assign(state, remoteState);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        console.warn("Remote state is larger than localStorage; using in-memory state for this session.");
      }
      render();
      showToast("已从后端加载素材库");
    } else {
      backendSync.hydrating = false;
      scheduleBackendStateSave(JSON.stringify(state), 0);
    }
  } catch (error) {
    console.warn("Backend state sync disabled for this session.", error);
  } finally {
    backendSync.hydrating = false;
  }
}

function scheduleBackendStateSave(snapshot = "", delay = 500) {
  if (backendSync.hydrating) return;
  const body = snapshot || JSON.stringify(state);
  if (!body || body === backendSync.lastSnapshot) return;
  window.clearTimeout(backendSync.saveTimer);
  backendSync.saveTimer = window.setTimeout(async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/state`, {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body
      });
      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "后端状态保存失败");
      }
      backendSync.lastSnapshot = body;
    } catch (error) {
      console.warn("Backend state save failed.", error);
    }
  }, delay);
}

function redirectToLogin() {
  const loginBase = getApiBaseUrl() || "";
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `${loginBase}/login?next=${next}`;
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      if (activeView === "library") {
        activeProject = "all";
        els.projectFilter.value = "all";
      }
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (activeView === "queue") {
        els.statusFilter.value = "pending";
      }
      render();
    });
  });

  els.projectFilter.addEventListener("change", () => {
    activeProject = els.projectFilter.value;
    activeView = activeProject === "all" || activeProject === "unassigned" ? "library" : "canvas";
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === "library");
    });
    render();
  });
  els.statusFilter.addEventListener("change", render);
  els.searchInput.addEventListener("input", render);
  els.clearSearch.addEventListener("click", () => {
    activeProject = "all";
    els.projectFilter.value = "all";
    els.statusFilter.value = "all";
    els.searchInput.value = "";
    activeView = "library";
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === "library");
    });
    render();
  });

  els.uploadButton.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") els.fileInput.click();
  });
  els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

  ["dragenter", "dragover"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    els.dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
    });
  });
  els.dropZone.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));

  els.seedButton.addEventListener("click", () => {
    state.deletedProjectIds = [];
    state.projects = structuredClone(defaultProjects);
    state.assets = structuredClone(sampleAssets);
    state.canvasLayouts = {};
    state.feedback = [];
    activeProject = "all";
    activeView = "library";
    saveState();
    render();
  });

  els.logoutButton.addEventListener("click", handleLogout);

  els.projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createProject();
  });

  els.canvasZoomIn.addEventListener("click", () => zoomCanvas(1.15));
  els.canvasZoomOut.addEventListener("click", () => zoomCanvas(0.85));
  els.fitCanvasButton.addEventListener("click", fitCanvasToContent);
  els.tidyCanvasButton.addEventListener("click", tidyCanvasAssets);
  els.addGroupButton.addEventListener("click", addCanvasGroup);
  els.addNoteButton.addEventListener("click", addCanvasNote);
  els.resetCanvasButton.addEventListener("click", resetProjectCanvas);
  els.canvasMinimap.addEventListener("click", handleMinimapClick);
  els.canvasViewport.addEventListener("dblclick", handleCanvasDoubleClick);
  els.canvasViewport.addEventListener("pointerdown", startCanvasPan);
  els.canvasViewport.addEventListener("wheel", handleCanvasWheelPan, { passive: false });
  document.addEventListener("pointermove", handleCanvasPointerMove);
  document.addEventListener("pointerup", stopCanvasPointer);

  document.querySelectorAll(".task-row").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = "library";
      activeProject = "all";
      els.projectFilter.value = "all";
      els.statusFilter.value = button.dataset.taskStatus;
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.view === "library");
      });
      render();
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".card-menu-wrap")) return;
    if (event.target.closest(".project-menu-wrap")) return;
    closeAssetMenus();
    closeProjectMenus();
  });
}

async function handleLogout() {
  try {
    await fetch(`${getApiBaseUrl()}/api/logout`, {
      method: "POST"
    });
  } catch (error) {
    console.warn("Logout request failed.", error);
  } finally {
    window.location.href = `${getApiBaseUrl() || ""}/login`;
  }
}

function render() {
  document.body.dataset.view = activeView;
  renderProjectControls();
  renderMetrics();
  if (activeView === "canvas" && activeProject !== "all" && activeProject !== "unassigned") {
    renderCanvas();
  } else {
    renderAssets();
  }
  renderProfile();
}

function renderProjectControls() {
  const projects = getProjects();
  els.projectFilter.replaceChildren(new Option("全部项目", "all"), ...projects.map((project) => new Option(project.name, project.id)));
  els.projectFilter.value = activeProject;

  els.projectNav.replaceChildren();
  const navItems = [{ id: "all", name: "全部素材" }, ...projects];
  navItems.forEach((project) => {
    const row = document.createElement("div");
    row.className = "project-row";

    const button = document.createElement("button");
    button.className = `project-nav-item${activeProject === project.id ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span></span><span class="project-count"></span>`;
    button.querySelector("span:first-child").textContent = project.name;
    button.querySelector(".project-count").textContent = countAssetsForProject(project.id);
    button.addEventListener("click", () => {
      activeProject = project.id;
      els.projectFilter.value = project.id;
      activeView = project.id === "all" ? "library" : "canvas";
      if (project.id === "unassigned") activeView = "library";
      if (activeView === "canvas") {
        els.statusFilter.value = "all";
        els.searchInput.value = "";
      }
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.view === "library");
      });
      render();
    });
    row.append(button);

    if (project.id !== "all" && project.id !== "unassigned") {
      const menuWrap = document.createElement("div");
      menuWrap.className = "project-menu-wrap";
      menuWrap.innerHTML = `
        <button class="project-menu-trigger" type="button" aria-label="项目操作" aria-expanded="false">...</button>
        <div class="project-menu" hidden>
          <button class="delete-project-button danger" type="button">删除项目</button>
        </div>
      `;

      const menuTrigger = menuWrap.querySelector(".project-menu-trigger");
      const menu = menuWrap.querySelector(".project-menu");
      menuTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const shouldOpen = menu.hidden;
        closeAssetMenus();
        closeProjectMenus();
        menu.hidden = !shouldOpen;
        menuTrigger.setAttribute("aria-expanded", String(shouldOpen));
      });
      menuWrap.querySelector(".delete-project-button").addEventListener("click", (event) => {
        event.stopPropagation();
        deleteProject(project.id);
      });
      row.append(menuWrap);
    }

    els.projectNav.append(row);
  });
}

function renderMetrics() {
  const counts = countAssetsByStatus();
  els.metricAssets.textContent = state.assets.length;
  els.metricPending.textContent = counts.pending;
  els.metricConfirmed.textContent = counts.confirmed;
  els.metricQuickConfirm.textContent = counts.recommended;
  els.reviewRecommended.textContent = counts.recommended;
  els.reviewPossible.textContent = counts.possible;
  els.reviewPending.textContent = counts.pending;
  els.reviewProcessing.textContent = counts.processing;
}

function renderAssets() {
  const assets = getVisibleAssets();
  const projects = getProjects();
  els.canvasArea.hidden = true;
  els.assetGrid.hidden = false;
  els.uploadButton.textContent = "上传素材";
  els.clearSearch.textContent = "清空筛选";
  els.assetGrid.replaceChildren();
  els.emptyState.hidden = assets.length > 0;
  updateViewTitles(assets.length);

  assets.forEach((asset) => {
    const card = els.template.content.firstElementChild.cloneNode(true);
    const project = getProject(asset.recommendedProjectId);
    const confirmedProject = asset.projectId ? getProject(asset.projectId) : null;
    const isEditing = editingAssetIds.has(asset.id);
    const isAudio = isAudioAsset(asset);
    const isVideo = isVideoAsset(asset);
    card.dataset.type = asset.type || "image";
    const thumb = card.querySelector(".thumb");
    thumb.src = asset.thumbnail;
    thumb.alt = asset.title;
    thumb.hidden = isVideo;
    const audio = card.querySelector(".asset-audio");
    if (isAudio && asset.audioSrc) {
      audio.src = asset.audioSrc;
      audio.hidden = false;
    }
    const video = card.querySelector(".asset-video");
    if (isVideo && asset.videoSrc) {
      video.src = asset.videoSrc;
      video.hidden = false;
    }
    card.querySelector(".status-pill").textContent = statusLabel(asset.status);
    card.querySelector("h4").textContent = asset.title;
    card.querySelector(".score").textContent =
      asset.status === "processing" ? "处理中" : `${Math.round(asset.score * 100)}%`;
    card.querySelector(".asset-description").textContent = asset.description;
    card.querySelector(".recommend-project").textContent = `推荐：${project.name}`;
    card.querySelector(".recommend-reason").textContent = asset.reason;

    const tagList = card.querySelector(".tag-list");
    tagList.replaceChildren(...asset.tags.map(makeTag));

    const select = card.querySelector(".project-select");
    select.required = true;
    select.replaceChildren(
      new Option("请选择项目", ""),
      ...projects.filter((item) => item.id !== "unassigned").map((item) => new Option(item.name, item.id))
    );
    select.value = asset.projectId || (asset.recommendedProjectId === "unassigned" ? "" : asset.recommendedProjectId);

    const inlineFeedback = card.querySelector(".inline-feedback");
    const actions = card.querySelector(".card-actions");
    const confirmButton = card.querySelector(".confirm-button");
    const rejectButton = card.querySelector(".reject-button");
    const menuTrigger = card.querySelector(".menu-trigger");
    const cardMenu = card.querySelector(".card-menu");
    const editButton = card.querySelector(".edit-asset-button");
    const deleteButton = card.querySelector(".delete-asset-button");

    if (asset.status === "confirmed" && !isEditing) {
      actions.classList.add("is-confirmed");
      inlineFeedback.hidden = false;
      inlineFeedback.textContent = `已归档到「${confirmedProject?.name || "项目"}」，推荐结果已写入反馈记录。`;
      select.disabled = true;
      confirmButton.hidden = true;
      rejectButton.hidden = true;
    } else if (isEditing) {
      inlineFeedback.hidden = false;
      inlineFeedback.textContent = "正在修改归档项目，选择后点击保存。";
      confirmButton.textContent = "保存";
    }

    confirmButton.disabled = asset.status === "processing";
    confirmButton.addEventListener("click", () => {
      confirmAsset(asset.id, select);
    });
    rejectButton.disabled = asset.status === "processing";
    rejectButton.addEventListener("click", () => moveToPending(asset.id));
    const copyImageButton = card.querySelector(".copy-image-button");
    copyImageButton.hidden = isAudio || isVideo;
    copyImageButton.disabled = asset.status === "processing" || isAudio || isVideo;
    copyImageButton.addEventListener("click", () => copyAssetImage(asset));
    card.querySelector(".similar-button").disabled = asset.status === "processing";
    card.querySelector(".similar-button").addEventListener("click", () => searchSimilar(asset));

    menuTrigger.disabled = asset.status === "processing";
    menuTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = cardMenu.hidden;
      document.querySelectorAll(".card-menu").forEach((menu) => {
        menu.hidden = true;
      });
      document.querySelectorAll(".menu-trigger").forEach((trigger) => {
        trigger.setAttribute("aria-expanded", "false");
      });
      cardMenu.hidden = !isOpen;
      menuTrigger.setAttribute("aria-expanded", String(isOpen));
    });
    editButton.disabled = asset.status === "processing";
    editButton.addEventListener("click", () => {
      editingAssetIds.add(asset.id);
      render();
    });
    deleteButton.disabled = asset.status === "processing";
    deleteButton.addEventListener("click", () => deleteAsset(asset.id));

    els.assetGrid.append(card);
  });
}

function renderCanvas() {
  const project = getProject(activeProject);
  const assets = getProjectAssets(activeProject);
  const layout = getCanvasLayout(activeProject);
  ensureCanvasAssetPositions(layout, assets);

  els.assetGrid.hidden = true;
  els.emptyState.hidden = true;
  els.canvasArea.hidden = false;
  els.canvasProjectName.textContent = `${project.name}画布`;
  els.canvasStats.textContent = `${assets.length} 张相关素材`;
  els.canvasZoomReadout.textContent = `${Math.round(layout.zoom * 100)}%`;
  els.uploadButton.textContent = `上传到${project.name}`;
  els.viewEyebrow.textContent = "Project Canvas";
  els.viewTitle.textContent = project.name;
  els.clearSearch.textContent = "返回素材库";
  els.canvasWorld.replaceChildren();
  applyCanvasTransform(layout);

  layout.columns.forEach((column) => {
    const element = document.createElement("section");
    element.className = "canvas-column";
    element.dataset.columnId = column.id;
    element.style.left = `${column.x}px`;
    element.style.top = `${column.y}px`;
    element.style.width = `${column.w}px`;
    element.style.height = `${column.h}px`;
    element.innerHTML = `
      <div class="canvas-column-head">
        <strong></strong>
        <span></span>
      </div>
    `;
    element.querySelector("strong").textContent = column.title;
    element.querySelector("span").textContent = column.hint;
    els.canvasWorld.append(element);
  });

  layout.groups.forEach((group) => {
    const element = document.createElement("section");
    element.className = "canvas-group";
    element.dataset.type = "group";
    element.dataset.id = group.id;
    element.style.left = `${group.x}px`;
    element.style.top = `${group.y}px`;
    element.style.width = `${group.w}px`;
    element.style.height = `${group.h}px`;
    element.innerHTML = `
      <div class="canvas-group-title"></div>
      <button class="canvas-delete-chip" type="button">删除</button>
      <span class="canvas-resize-handle" aria-hidden="true"></span>
    `;
    element.querySelector(".canvas-group-title").textContent = group.title;
    element.querySelector(".canvas-group-title").addEventListener("dblclick", () => renameCanvasGroup(group.id));
    element.querySelector(".canvas-delete-chip").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCanvasGroup(group.id);
    });
    element.querySelector(".canvas-resize-handle").addEventListener("pointerdown", (event) => startCanvasGroupResize(event, group.id));
    element.addEventListener("pointerdown", (event) => startCanvasElementDrag(event, "group", group.id));
    els.canvasWorld.append(element);
  });

  layout.notes.forEach((note) => {
    const element = document.createElement("article");
    element.className = "canvas-note";
    element.dataset.type = "note";
    element.dataset.id = note.id;
    element.style.left = `${note.x}px`;
    element.style.top = `${note.y}px`;
    element.innerHTML = `<textarea aria-label="便签内容"></textarea><button class="canvas-delete-chip" type="button">删除</button>`;
    const textarea = element.querySelector("textarea");
    textarea.value = note.text;
    textarea.addEventListener("input", () => {
      note.text = textarea.value;
      saveState();
    });
    textarea.addEventListener("pointerdown", (event) => event.stopPropagation());
    element.querySelector(".canvas-delete-chip").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCanvasNote(note.id);
    });
    element.addEventListener("pointerdown", (event) => startCanvasElementDrag(event, "note", note.id));
    els.canvasWorld.append(element);
  });

  assets.forEach((asset) => {
    const position = layout.items[asset.id];
    const card = els.canvasAssetTemplate.content.firstElementChild.cloneNode(true);
    const isAudio = isAudioAsset(asset);
    const isVideo = isVideoAsset(asset);
    card.dataset.type = "asset";
    card.dataset.id = asset.id;
    card.dataset.assetType = asset.type || "image";
    card.dataset.columnId = position.columnId || inferCanvasColumnId(asset);
    card.style.left = `${position.x}px`;
    card.style.top = `${position.y}px`;
    const image = card.querySelector(".canvas-asset-image");
    image.src = asset.thumbnail;
    image.alt = asset.title;
    image.hidden = isVideo;
    const audio = card.querySelector(".canvas-asset-audio");
    if (isAudio && asset.audioSrc) {
      audio.src = asset.audioSrc;
      audio.hidden = false;
    }
    const video = card.querySelector(".canvas-asset-video");
    if (isVideo && asset.videoSrc) {
      video.src = asset.videoSrc;
      video.hidden = false;
    }
    card.querySelector("strong").textContent = asset.title;
    card.querySelector("span").textContent = `${statusLabel(asset.status)} · ${Math.round(asset.score * 100)}%`;
    card.querySelector(".canvas-delete-asset").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteAsset(asset.id);
    });
    const copyCanvasButton = card.querySelector(".copy-canvas-asset");
    copyCanvasButton.hidden = isAudio || isVideo;
    copyCanvasButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copyAssetImage(asset);
    });
    card.querySelector(".pending-canvas-asset").addEventListener("click", (event) => {
      event.stopPropagation();
      moveToPending(asset.id);
    });
    card.addEventListener("pointerdown", (event) => startCanvasElementDrag(event, "asset", asset.id));
    card.addEventListener("dblclick", () => {
      if (!isAudio && !isVideo) copyAssetImage(asset);
    });
    els.canvasWorld.append(card);
  });

  renderCanvasMinimap(layout, assets);
  saveState();
}

function renderProfile() {
  const projects = getProjects();
  const project =
    activeProject !== "all"
      ? getProject(activeProject)
      : projects.find((item) => item.id === mostActiveProjectId()) || projects[0];
  els.profileName.textContent = project.name;
  els.profileDescription.textContent = project.description;
  els.profileTags.replaceChildren(...project.keywords.map(makeTag));
  els.profileSignals.replaceChildren();
  project.signals.forEach((signal) => {
    const li = document.createElement("li");
    li.textContent = signal;
    els.profileSignals.append(li);
  });

  const feedback = state.feedback.slice(-5).reverse();
  els.feedbackList.replaceChildren();
  if (!feedback.length) {
    const empty = document.createElement("div");
    empty.className = "feedback-item";
    empty.textContent = "暂无反馈记录";
    els.feedbackList.append(empty);
    return;
  }
  feedback.forEach((item) => {
    const row = document.createElement("div");
    row.className = "feedback-item";
    row.textContent = item.text;
    els.feedbackList.append(row);
  });
}

function updateViewTitles(count) {
  const status = els.statusFilter.value;
  if (activeView === "queue") {
    els.viewEyebrow.textContent = "Review Queue";
    els.viewTitle.textContent = `待确认素材 ${count}`;
  } else if (activeView === "projects") {
    els.viewEyebrow.textContent = "Profiles";
    els.viewTitle.textContent = `项目画像关联素材 ${count}`;
  } else if (status !== "all") {
    els.viewEyebrow.textContent = "Filtered";
    els.viewTitle.textContent = `${statusLabel(status)} ${count}`;
  } else {
    els.viewEyebrow.textContent = "Library";
    els.viewTitle.textContent = `素材推荐 ${count}`;
  }
}

function getVisibleAssets() {
  const query = normalize(els.searchInput.value);
  const status = activeView === "queue" ? "pending" : els.statusFilter.value;

  return state.assets.filter((asset) => {
    const projectMatch =
      activeProject === "all" ||
      asset.projectId === activeProject ||
      asset.recommendedProjectId === activeProject;
    const statusMatch = status === "all" || asset.status === status;
    const queryMatch =
      !query ||
      normalize(
        [
          asset.title,
          asset.description,
          asset.reason,
          getProject(asset.recommendedProjectId).name,
          ...asset.tags
        ].join(" ")
      ).includes(query);
    return projectMatch && statusMatch && queryMatch;
  });
}

function getProjectAssets(projectId) {
  return state.assets.filter((asset) => asset.projectId === projectId || asset.recommendedProjectId === projectId);
}

function getCanvasLayout(projectId) {
  state.canvasLayouts ||= {};
  if (!state.canvasLayouts[projectId]) {
    state.canvasLayouts[projectId] = {
      version: CANVAS_LAYOUT_VERSION,
      zoom: 1,
      panX: 0,
      panY: 0,
      columns: structuredClone(CANVAS_COLUMNS),
      items: {},
      groups: [],
      notes: [
        {
          id: crypto.randomUUID(),
          text: "把素材拖进不同列，先搭出角色、状态、镜头和输出之间的关系。",
          x: 1580,
          y: 84
        }
      ]
    };
  }
  const layout = state.canvasLayouts[projectId];
  if (layout.version !== CANVAS_LAYOUT_VERSION) {
    layout.version = CANVAS_LAYOUT_VERSION;
    layout.columns = structuredClone(CANVAS_COLUMNS);
    layout.groups = (layout.groups || []).filter((group) => !["角色参考", "场景 / 道具", "风格参考"].includes(group.title));
    layout.groups.forEach((group) => {
      group.y = Math.max(group.y || 0, 210);
    });
    (layout.notes || []).forEach((note) => {
      note.y = Math.max(note.y || 0, 150);
    });
    Object.keys(layout.items || {}).forEach((assetId) => {
      layout.items[assetId].columnId ||= getNearestCanvasColumn(layout.items[assetId].x, layout)?.id || "source";
      layout.items[assetId].y = Math.max(layout.items[assetId].y || 0, 182);
    });
  }
  layout.columns ||= structuredClone(CANVAS_COLUMNS);
  layout.groups ||= [];
  layout.notes ||= [];
  layout.items ||= {};
  return layout;
}

function ensureCanvasAssetPositions(layout, assets) {
  assets.forEach((asset, index) => {
    const existing = layout.items[asset.id];
    if (existing) {
      const inferredColumnId = inferCanvasColumnId(asset);
      if (existing.autoPlaced !== false && asset.status !== "processing" && existing.columnId !== inferredColumnId) {
        const column = layout.columns.find((item) => item.id === inferredColumnId) || layout.columns[0];
        existing.columnId = column.id;
        const position = findFreeCanvasAssetPosition(layout, assets, column.id, asset.id);
        existing.x = position.x;
        existing.y = position.y;
      }
      existing.columnId ||= getNearestCanvasColumn(existing.x, layout)?.id || inferredColumnId;
      return;
    }
    const columnId = inferCanvasColumnId(asset);
    const column = layout.columns.find((item) => item.id === columnId) || layout.columns[index % layout.columns.length];
    const position = findFreeCanvasAssetPosition(layout, assets, column.id, asset.id);
    layout.items[asset.id] = {
      autoPlaced: true,
      columnId: column.id,
      x: position.x,
      y: position.y
    };
  });
  resolveCanvasAssetCollisions(layout, assets);
}

function inferCanvasColumnId(asset) {
  if (isVideoAsset(asset)) return "output";
  if (isAudioAsset(asset)) return "voice";
  const visual = asset.visualFeatures || {};
  const aiColumnId = normalizeCanvasColumnId(asset.canvasColumnId);
  const textParts = [
    asset.title,
    asset.description,
    asset.reason,
    visual.subject,
    visual.scene,
    visual.style,
    visual.usage,
    ...(visual.colors || []),
    ...(asset.tags || [])
  ].filter((value) => {
    const textValue = String(value || "").trim();
    return textValue && !/^(未知主体|未知场景|未知风格|素材参考)$/.test(textValue);
  });
  const text = normalize(
    textParts.join(" ")
  );
  if (asset.status === "processing") return "source";
  const looksLikeOutput = /(视频|成片|最终输出|输出结果|待复用结果|即梦视频|即梦成片|video|final output)/i.test(text);
  const looksLikeCharacter = /(角色|人物|人像|卡通形象|ip形象|形象设定|动物角色|松鼠|玩偶|表情|状态|造型|姿态|服饰|装酷|冷酷|情绪|微笑|害怕|愤怒|character|mascot|pose)/i.test(text);
  const looksLikeSource = /(道具|参考图|原始图|配饰|头饰|发箍|船|天鹅船|玩具|小物|物件|物品|source|prop|accessory|toy)/i.test(text);
  const looksLikeScene = /(环境|背景|镜头|分镜|街道|城市|园林|宫殿|室内|氛围|旋转木马|游乐园|乐园|建筑|房间|scene|shot|city|environment|background)/i.test(text);

  if (aiColumnId && aiColumnId !== "output") return aiColumnId;
  if (aiColumnId === "output") return looksLikeOutput ? "output" : looksLikeCharacter ? "state" : "source";
  if (looksLikeOutput) return "output";
  if (looksLikeCharacter) return "state";
  if (looksLikeSource) return "source";
  if (looksLikeScene) return "scene";
  return "source";
}

function getNearestCanvasColumn(x, layout = null) {
  const columns = layout?.columns || CANVAS_COLUMNS;
  return columns
    .map((column) => ({
      column,
      distance: Math.abs(x + 95 - (column.x + column.w / 2))
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.column;
}

function getCanvasColumn(layout, columnId) {
  return layout.columns.find((column) => column.id === columnId) || layout.columns[0];
}

function getCanvasAssetX(column) {
  return column.x + Math.max(24, (column.w - CANVAS_ASSET_WIDTH) / 2);
}

function getCanvasAssetBox(item) {
  return {
    x: item.x,
    y: item.y,
    w: CANVAS_ASSET_WIDTH,
    h: CANVAS_ASSET_HEIGHT
  };
}

function canvasBoxesOverlap(a, b, gap = CANVAS_ASSET_GAP) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function findFreeCanvasAssetPosition(layout, assets, columnId, assetId, preferredY = null) {
  const column = getCanvasColumn(layout, columnId);
  const x = getCanvasAssetX(column);
  let y = Math.max(preferredY ?? column.y + CANVAS_ASSET_TOP_OFFSET, column.y + CANVAS_ASSET_TOP_OFFSET);
  const occupied = assets
    .map((asset) => {
      if (asset.id === assetId) return null;
      const item = layout.items[asset.id];
      if (!item || item.columnId !== column.id) return null;
      return getCanvasAssetBox(item);
    })
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);

  let loops = 0;
  while (loops < 200) {
    const nextBox = { x, y, w: CANVAS_ASSET_WIDTH, h: CANVAS_ASSET_HEIGHT };
    const overlap = occupied.find((box) => canvasBoxesOverlap(nextBox, box));
    if (!overlap) break;
    y = overlap.y + overlap.h + CANVAS_ASSET_GAP;
    loops += 1;
  }

  column.h = Math.max(column.h, y + CANVAS_ASSET_HEIGHT + 80 - column.y);
  return { x, y };
}

function resolveCanvasAssetCollisions(layout, assets, anchorId = null) {
  layout.columns.forEach((column) => {
    const columnAssets = assets
      .map((asset) => {
        const item = layout.items[asset.id];
        if (!item) return null;
        item.columnId ||= column.id;
        if (item.columnId !== column.id) return null;
        return { asset, item };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.asset.id === anchorId) return -1;
        if (b.asset.id === anchorId) return 1;
        return a.item.y - b.item.y || a.item.x - b.item.x;
      });

    const occupied = [];
    columnAssets.forEach(({ asset, item }) => {
      item.x = clamp(item.x, column.x + 16, column.x + column.w - CANVAS_ASSET_WIDTH - 16);
      item.y = Math.max(item.y, column.y + CANVAS_ASSET_TOP_OFFSET);
      let box = getCanvasAssetBox(item);
      let loops = 0;
      while (loops < 200) {
        const overlap = occupied.find((candidate) => canvasBoxesOverlap(box, candidate));
        if (!overlap) break;
        item.y = overlap.y + overlap.h + CANVAS_ASSET_GAP;
        box = getCanvasAssetBox(item);
        loops += 1;
      }
      occupied.push(box);
      if (asset.id !== anchorId && item.autoPlaced !== false) {
        item.x = getCanvasAssetX(column);
      }
    });

    const maxY = occupied.length ? Math.max(...occupied.map((box) => box.y + box.h)) : column.y;
    column.h = Math.max(column.h, maxY + 80 - column.y);
  });
}

function applyCanvasTransform(layout) {
  els.canvasWorld.style.transform = `translate(${layout.panX}px, ${layout.panY}px) scale(${layout.zoom})`;
}

function fitCanvasToContent() {
  if (activeView !== "canvas") return;
  const layout = getCanvasLayout(activeProject);
  const bounds = getCanvasContentBounds(layout);
  const rect = els.canvasViewport.getBoundingClientRect();
  const zoom = clamp(Math.min((rect.width - 80) / bounds.w, (rect.height - 80) / bounds.h), 0.35, 1.25);
  layout.zoom = zoom;
  layout.panX = 40 - bounds.x * zoom;
  layout.panY = 40 - bounds.y * zoom;
  saveState();
  renderCanvas();
}

function tidyCanvasAssets() {
  if (activeView !== "canvas") return;
  const assets = getProjectAssets(activeProject);
  const layout = getCanvasLayout(activeProject);
  assets.forEach((asset, index) => {
    const columnId = layout.items[asset.id]?.columnId || inferCanvasColumnId(asset);
    const column = layout.columns.find((item) => item.id === columnId) || layout.columns[index % layout.columns.length];
    const position = findFreeCanvasAssetPosition(layout, assets, column.id, asset.id);
    layout.items[asset.id] = {
      columnId: column.id,
      autoPlaced: true,
      x: position.x,
      y: position.y
    };
  });
  resolveCanvasAssetCollisions(layout, assets);
  layout.panX = 0;
  layout.panY = 0;
  layout.zoom = 1;
  showToast("已整理项目素材");
  saveState();
  renderCanvas();
}

function zoomCanvas(multiplier) {
  if (activeView !== "canvas") return;
  const layout = getCanvasLayout(activeProject);
  layout.zoom = clamp(layout.zoom * multiplier, 0.35, 2.2);
  saveState();
  renderCanvas();
}

function handleCanvasDoubleClick(event) {
  if (activeView !== "canvas") return;
  if (event.target.closest(".canvas-asset-card, .canvas-group, .canvas-note, button, textarea")) return;
  zoomCanvas(1.15);
}

function handleCanvasWheelPan(event) {
  if (activeView !== "canvas") return;
  if (event.ctrlKey) return;
  if (event.target.closest("audio, video, select, textarea")) return;
  event.preventDefault();
  const layout = getCanvasLayout(activeProject);
  const speed = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : 1;
  layout.panX -= event.deltaX * speed;
  layout.panY -= event.deltaY * speed;
  applyCanvasTransform(layout);
  renderCanvasMinimap(layout, getProjectAssets(activeProject));
  window.clearTimeout(canvasRuntime.wheelSaveTimer);
  canvasRuntime.wheelSaveTimer = window.setTimeout(saveState, 180);
}

function startCanvasPan(event) {
  if (activeView !== "canvas") return;
  if (event.button !== 0) return;
  if (event.target.closest(".canvas-asset-card, .canvas-group, .canvas-note, button, textarea")) return;
  const layout = getCanvasLayout(activeProject);
  canvasRuntime.pan = {
    startX: event.clientX,
    startY: event.clientY,
    panX: layout.panX,
    panY: layout.panY
  };
  els.canvasViewport.classList.add("is-panning");
}

function startCanvasElementDrag(event, type, id) {
  if (event.button !== 0) return;
  if (event.target.closest("button, textarea")) return;
  event.preventDefault();
  event.stopPropagation();
  const layout = getCanvasLayout(activeProject);
  const target = getCanvasLayoutTarget(layout, type, id);
  if (!target) return;
  canvasRuntime.drag = {
    type,
    id,
    startX: event.clientX,
    startY: event.clientY,
    x: target.x,
    y: target.y,
    zoom: layout.zoom
  };
}

function startCanvasGroupResize(event, id) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const layout = getCanvasLayout(activeProject);
  const group = layout.groups.find((item) => item.id === id);
  if (!group) return;
  canvasRuntime.resize = {
    id,
    startX: event.clientX,
    startY: event.clientY,
    w: group.w,
    h: group.h,
    zoom: layout.zoom
  };
}

function handleCanvasPointerMove(event) {
  if (canvasRuntime.resize) {
    const layout = getCanvasLayout(activeProject);
    const group = layout.groups.find((item) => item.id === canvasRuntime.resize.id);
    if (!group) return;
    group.w = clamp(canvasRuntime.resize.w + (event.clientX - canvasRuntime.resize.startX) / canvasRuntime.resize.zoom, 220, 900);
    group.h = clamp(canvasRuntime.resize.h + (event.clientY - canvasRuntime.resize.startY) / canvasRuntime.resize.zoom, 160, 680);
    const element = els.canvasWorld.querySelector(`[data-type="group"][data-id="${canvasRuntime.resize.id}"]`);
    if (element) {
      element.style.width = `${group.w}px`;
      element.style.height = `${group.h}px`;
    }
    return;
  }

  if (canvasRuntime.drag) {
    const layout = getCanvasLayout(activeProject);
    const target = getCanvasLayoutTarget(layout, canvasRuntime.drag.type, canvasRuntime.drag.id);
    if (!target) return;
    target.x = canvasRuntime.drag.x + (event.clientX - canvasRuntime.drag.startX) / canvasRuntime.drag.zoom;
    target.y = canvasRuntime.drag.y + (event.clientY - canvasRuntime.drag.startY) / canvasRuntime.drag.zoom;
    if (canvasRuntime.drag.type === "asset") {
      const column = getNearestCanvasColumn(target.x, layout);
      target.columnId = column?.id || target.columnId;
      target.autoPlaced = false;
    }
    const element = els.canvasWorld.querySelector(`[data-type="${canvasRuntime.drag.type}"][data-id="${canvasRuntime.drag.id}"]`);
    if (element) {
      element.style.left = `${target.x}px`;
      element.style.top = `${target.y}px`;
      if (canvasRuntime.drag.type === "asset" && target.columnId) {
        element.dataset.columnId = target.columnId;
      }
    }
    return;
  }

  if (canvasRuntime.pan) {
    const layout = getCanvasLayout(activeProject);
    layout.panX = canvasRuntime.pan.panX + event.clientX - canvasRuntime.pan.startX;
    layout.panY = canvasRuntime.pan.panY + event.clientY - canvasRuntime.pan.startY;
    applyCanvasTransform(layout);
  }
}

function stopCanvasPointer() {
  if (!canvasRuntime.drag && !canvasRuntime.pan && !canvasRuntime.resize) return;
  let shouldRender = false;
  if (canvasRuntime.drag?.type === "asset") {
    const layout = getCanvasLayout(activeProject);
    const target = getCanvasLayoutTarget(layout, "asset", canvasRuntime.drag.id);
    const column = target ? getNearestCanvasColumn(target.x, layout) : null;
    if (target && column) target.columnId = column.id;
    resolveCanvasAssetCollisions(layout, getProjectAssets(activeProject), canvasRuntime.drag.id);
    shouldRender = true;
  }
  canvasRuntime.drag = null;
  canvasRuntime.pan = null;
  canvasRuntime.resize = null;
  els.canvasViewport.classList.remove("is-panning");
  saveState();
  if (shouldRender) renderCanvas();
}

function getCanvasLayoutTarget(layout, type, id) {
  if (type === "asset") return layout.items[id];
  if (type === "group") return layout.groups.find((group) => group.id === id);
  if (type === "note") return layout.notes.find((note) => note.id === id);
  return null;
}

function addCanvasGroup() {
  if (activeView !== "canvas") return;
  const title = window.prompt("分组名称", "新分组");
  if (!title) return;
  const layout = getCanvasLayout(activeProject);
  const origin = getCanvasViewportCenter(layout);
  layout.groups.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    x: origin.x - 180,
    y: Math.max(origin.y - 120, 210),
    w: 380,
    h: 260
  });
  saveState();
  renderCanvas();
}

function addCanvasNote() {
  if (activeView !== "canvas") return;
  const layout = getCanvasLayout(activeProject);
  const origin = getCanvasViewportCenter(layout);
  layout.notes.push({
    id: crypto.randomUUID(),
    text: "新的项目便签",
    x: origin.x - 90,
    y: origin.y - 60
  });
  saveState();
  renderCanvas();
}

function renameCanvasGroup(groupId) {
  const layout = getCanvasLayout(activeProject);
  const group = layout.groups.find((item) => item.id === groupId);
  if (!group) return;
  const title = window.prompt("分组名称", group.title);
  if (!title) return;
  group.title = title.trim();
  saveState();
  renderCanvas();
}

function deleteCanvasGroup(groupId) {
  const layout = getCanvasLayout(activeProject);
  layout.groups = layout.groups.filter((group) => group.id !== groupId);
  saveState();
  renderCanvas();
}

function deleteCanvasNote(noteId) {
  const layout = getCanvasLayout(activeProject);
  layout.notes = layout.notes.filter((note) => note.id !== noteId);
  saveState();
  renderCanvas();
}

function resetProjectCanvas() {
  if (activeView !== "canvas") return;
  const confirmed = window.confirm("确定重置当前项目画布布局吗？素材不会被删除。");
  if (!confirmed) return;
  delete state.canvasLayouts[activeProject];
  saveState();
  renderCanvas();
}

function getCanvasViewportCenter(layout) {
  const rect = els.canvasViewport.getBoundingClientRect();
  return {
    x: (rect.width / 2 - layout.panX) / layout.zoom,
    y: (rect.height / 2 - layout.panY) / layout.zoom
  };
}

function getCanvasContentBounds(layout) {
  const boxes = [
    ...layout.columns.map((column) => ({ x: column.x, y: column.y, w: column.w, h: column.h })),
    ...Object.values(layout.items).map((item) => ({ x: item.x, y: item.y, w: CANVAS_ASSET_WIDTH, h: CANVAS_ASSET_HEIGHT })),
    ...layout.groups.map((group) => ({ x: group.x, y: group.y, w: group.w, h: group.h })),
    ...layout.notes.map((note) => ({ x: note.x, y: note.y, w: 210, h: 150 }))
  ];
  if (!boxes.length) return { x: 0, y: 0, w: 800, h: 520 };
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return {
    x: minX,
    y: minY,
    w: Math.max(maxX - minX, 360),
    h: Math.max(maxY - minY, 260)
  };
}

function renderCanvasMinimap(layout, assets) {
  const scaleX = 150 / 2400;
  const scaleY = 94 / 1600;
  const columnBoxes = layout.columns
    .map(
      (column) =>
        `<span class="minimap-column" style="left:${column.x * scaleX}px;top:${column.y * scaleY}px;width:${column.w * scaleX}px;height:${column.h * scaleY}px"></span>`
    )
    .join("");
  const assetDots = assets
    .map((asset) => {
      const item = layout.items[asset.id];
      if (!item) return "";
      return `<span class="minimap-dot asset" style="left:${item.x * scaleX}px;top:${item.y * scaleY}px"></span>`;
    })
    .join("");
  const groupBoxes = layout.groups
    .map(
      (group) =>
        `<span class="minimap-box" style="left:${group.x * scaleX}px;top:${group.y * scaleY}px;width:${group.w * scaleX}px;height:${group.h * scaleY}px"></span>`
    )
    .join("");
  const rect = els.canvasViewport.getBoundingClientRect();
  const viewX = (-layout.panX / layout.zoom) * scaleX;
  const viewY = (-layout.panY / layout.zoom) * scaleY;
  const viewW = (rect.width / layout.zoom) * scaleX;
  const viewH = (rect.height / layout.zoom) * scaleY;
  els.canvasMinimap.innerHTML = `${columnBoxes}${groupBoxes}${assetDots}<span class="minimap-view" style="left:${viewX}px;top:${viewY}px;width:${viewW}px;height:${viewH}px"></span>`;
}

function handleMinimapClick(event) {
  if (activeView !== "canvas") return;
  const rect = els.canvasMinimap.getBoundingClientRect();
  const layout = getCanvasLayout(activeProject);
  const worldX = ((event.clientX - rect.left) / rect.width) * 2400;
  const worldY = ((event.clientY - rect.top) / rect.height) * 1600;
  const viewport = els.canvasViewport.getBoundingClientRect();
  layout.panX = viewport.width / 2 - worldX * layout.zoom;
  layout.panY = viewport.height / 2 - worldY * layout.zoom;
  saveState();
  renderCanvas();
}

function handleFiles(fileList) {
  const files = [...fileList].filter((file) => isImageFile(file) || isAudioFile(file) || isVideoFile(file));
  const uploadProjectId = getActiveUploadProjectId();
  files.forEach((file) => {
    const reader = new FileReader();
    const id = crypto.randomUUID();
    const uploadProject = uploadProjectId ? getProject(uploadProjectId) : null;
    const isAudio = isAudioFile(file);
    const isVideo = isVideoFile(file);
    const mediaTypeLabel = isAudio ? "声音" : isVideo ? "视频" : "图片";
    const pendingAsset = {
      id,
      type: isAudio ? "audio" : isVideo ? "video" : "image",
      title: "AI 识别中",
      description: uploadProject
        ? `${mediaTypeLabel}已进入「${uploadProject.name}」项目画布，后台正在识别并生成标题、标签和推荐理由。`
        : `${mediaTypeLabel}已进入后台任务队列，正在识别并生成标题、标签和项目推荐。`,
      tags: ["处理中"],
      projectId: null,
      recommendedProjectId: uploadProjectId || "unassigned",
      score: 0,
      reason: uploadProject
        ? `根据当前所在项目，优先匹配「${uploadProject.name}」画像。`
        : "等待多模态识别和项目画像匹配。",
      status: "processing",
      thumbnail: isAudio ? makeAudioThumb("音色") : isVideo ? makeVideoThumb("视频") : makeThumb("处理中", "#686058", "#ddd5ca", "#147f76"),
      canvasColumnId: isAudio ? "voice" : isVideo ? "output" : ""
    };
    state.assets.unshift(pendingAsset);
    render();

    reader.addEventListener("load", () => {
      if (isAudio) {
        pendingAsset.audioSrc = reader.result;
      } else if (isVideo) {
        pendingAsset.videoSrc = reader.result;
      } else {
        pendingAsset.thumbnail = reader.result;
      }
      saveState();
      render();
      const analysisTask = isAudio
        ? analyzeUploadedAudio(file, reader.result, uploadProjectId)
        : isVideo
          ? analyzeUploadedVideo(file, reader.result, uploadProjectId)
        : analyzeUploadedImage(file, reader.result, uploadProjectId);
      analysisTask
        .then((analysis) => {
          Object.assign(
            pendingAsset,
            isAudio
              ? makeAudioAssetFromAnalysis(analysis, uploadProjectId, reader.result)
              : isVideo
                ? makeVideoAssetFromAnalysis(analysis, uploadProjectId, reader.result)
                : makeAssetFromAnalysis(analysis, uploadProjectId)
          );
          if (pendingAsset.status === "confirmed" && uploadProject) {
            state.feedback.push({
              id: crypto.randomUUID(),
              text: `已将「${pendingAsset.title}」上传并归档到${uploadProject.name}`,
              createdAt: new Date().toISOString()
            });
          }
          showToast(isAudio ? "声音素材已归入音色列" : isVideo ? "视频素材已归入输出结果列" : "AI 识别完成");
        })
        .catch((error) => {
          const fallback = makeFailedAnalysisAsset(file.name, uploadProjectId, error, isAudio ? "audio" : isVideo ? "video" : "image");
          if (!isAudio && !isVideo) {
            delete fallback.thumbnail;
          }
          Object.assign(pendingAsset, fallback);
          showToast(error.message || (isAudio ? "声音素材处理失败，已移入待确认" : isVideo ? "视频素材处理失败，已移入待确认" : "AI 识别失败，已移入待确认"));
        })
        .finally(() => {
          saveState();
          render();
        });
    });
    reader.readAsDataURL(file);
  });
  els.fileInput.value = "";
}

async function analyzeUploadedImage(file, imageDataUrl, preferredProjectId = null) {
  const apiBase = getApiBaseUrl();
  const requestBody = {
    fileName: file.name,
    imageDataUrl,
    preferredProjectId,
    canvasColumns: CANVAS_COLUMNS.map((column) => ({
      id: column.id,
      title: column.title,
      hint: column.hint
    })),
    projects: getProjects().map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      keywords: project.keywords
    }))
  };

  const jobResponse = await fetch(`${apiBase}/api/analyze-image-jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const jobPayload = await jobResponse.json().catch(() => ({}));
  if (jobResponse.status === 404) {
    return analyzeUploadedImageSync(apiBase, requestBody);
  }
  if (!jobResponse.ok) {
    throw new Error(jobPayload.message || "创建 AI 识别任务失败");
  }
  if (!jobPayload.jobId) {
    throw new Error("AI 识别任务没有返回 jobId");
  }

  return pollImageAnalysisJob(apiBase, jobPayload.jobId);
}

async function analyzeUploadedImageSync(apiBase, requestBody) {
  const response = await fetch(`${apiBase}/api/analyze-image`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "AI 识别失败");

  return payload.analysis;
}

async function pollImageAnalysisJob(apiBase, jobId) {
  const startedAt = Date.now();
  const timeoutMs = 8 * 60 * 1000;
  let delayMs = 1500;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(delayMs);
    const response = await fetch(`${apiBase}/api/analyze-image-jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "读取 AI 识别任务失败");
    }
    if (payload.status === "completed" && payload.analysis) {
      return payload.analysis;
    }
    if (payload.status === "failed") {
      throw new Error(payload.message || "AI 识别失败");
    }
    delayMs = Math.min(5000, Math.round(delayMs * 1.25));
  }

  throw new Error("AI 识别时间过长，请稍后重试。");
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function analyzeUploadedAudio(file, audioDataUrl, preferredProjectId = null) {
  const duration = await readAudioDuration(file).catch(() => 0);
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "声音素材";
  const lowerName = normalize(baseName);
  const tags = ["声音素材"];
  if (/(bgm|music|音乐|配乐|背景乐)/i.test(lowerName)) tags.push("BGM", "音乐参考");
  if (/(sfx|fx|音效|效果音|按钮|脚步|转场)/i.test(lowerName)) tags.push("音效");
  if (/(voice|vo|旁白|台词|配音|人声|对白)/i.test(lowerName)) tags.push("旁白", "人声");
  if (/(ambience|ambient|环境音|氛围|雨声|风声|街道)/i.test(lowerName)) tags.push("环境音");
  if (tags.length === 1) tags.push("音色参考");

  return {
    title: baseName.slice(0, 32),
    description: `${formatAudioDuration(duration)}声音素材，适合放入音色列作为 BGM、音效、旁白或氛围参考。`,
    tags,
    duration,
    audio_url: audioDataUrl,
    visual_features: {
      subject: "声音素材",
      scene: "",
      style: tags.includes("BGM") ? "音乐参考" : tags.includes("旁白") ? "人声参考" : "音色参考",
      colors: [],
      usage: "音色参考"
    },
    recommended_project_id: preferredProjectId || "unassigned",
    canvas_column_id: "voice",
    confidence: preferredProjectId ? 0.9 : 0.72,
    reason: preferredProjectId
      ? "声音素材从当前项目上传，自动进入音色列，等待后续精细标注。"
      : "声音素材暂未匹配具体项目，已标记为音色参考。"
  };
}

async function analyzeUploadedVideo(file, videoDataUrl, preferredProjectId = null) {
  const duration = await readMediaDuration(file, "video").catch(() => 0);
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "视频素材";
  const lowerName = normalize(baseName);
  const tags = ["视频素材"];
  if (/(final|成片|输出|result|render|导出)/i.test(lowerName)) tags.push("成片", "输出结果");
  if (/(shot|镜头|分镜|片段|clip)/i.test(lowerName)) tags.push("镜头片段");
  if (/(reference|ref|参考)/i.test(lowerName)) tags.push("视频参考");
  if (tags.length === 1) tags.push("待复用");

  return {
    title: baseName.slice(0, 32),
    description: `${formatAudioDuration(duration)}视频素材，适合放入输出结果列作为成片、片段或待复用视频参考。`,
    tags,
    duration,
    video_url: videoDataUrl,
    visual_features: {
      subject: "视频素材",
      scene: "",
      style: tags.includes("成片") ? "输出成片" : "视频参考",
      colors: [],
      usage: "输出结果"
    },
    recommended_project_id: preferredProjectId || "unassigned",
    canvas_column_id: "output",
    confidence: preferredProjectId ? 0.9 : 0.72,
    reason: preferredProjectId
      ? "视频素材从当前项目上传，自动进入输出结果列。"
      : "视频素材暂未匹配具体项目，已标记为输出结果参考。"
  };
}

function makeAssetFromAnalysis(analysis, preferredProjectId = null) {
  const projectIds = new Set(getProjects().map((project) => project.id));
  const shouldAutoConfirm = preferredProjectId && preferredProjectId !== "all" && preferredProjectId !== "unassigned";
  const recommendedProjectId = shouldAutoConfirm
    ? preferredProjectId
    : projectIds.has(analysis?.recommended_project_id)
      ? analysis.recommended_project_id
      : "unassigned";
  const score = clampScore(Number(analysis?.confidence), 0, 1, 0.5);
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
    title: cleanAssetText(analysis?.title, "AI 识别图片素材"),
    description: cleanAssetText(analysis?.description, "图片已完成 AI 识别，等待确认归档。"),
    tags: cleanAssetTags(analysis?.tags),
    visualFeatures: analysis?.visual_features || null,
    canvasColumnId: normalizeCanvasColumnId(analysis?.canvas_column_id),
    projectId: shouldAutoConfirm ? preferredProjectId : null,
    recommendedProjectId,
    score,
    reason: cleanAssetText(analysis?.reason, "根据图片视觉内容和项目关键词自动推荐。"),
    status
  };
}

function makeAudioAssetFromAnalysis(analysis, preferredProjectId = null, audioSrc = "") {
  const baseAsset = makeAssetFromAnalysis(analysis, preferredProjectId);
  return {
    ...baseAsset,
    type: "audio",
    audioSrc: analysis?.audio_url || audioSrc,
    duration: Number(analysis?.duration) || 0,
    thumbnail: makeAudioThumb("音色"),
    canvasColumnId: "voice"
  };
}

function makeVideoAssetFromAnalysis(analysis, preferredProjectId = null, videoSrc = "") {
  const baseAsset = makeAssetFromAnalysis(analysis, preferredProjectId);
  return {
    ...baseAsset,
    type: "video",
    videoSrc: analysis?.video_url || videoSrc,
    duration: Number(analysis?.duration) || 0,
    thumbnail: makeVideoThumb("视频"),
    canvasColumnId: "output"
  };
}

function makeFailedAnalysisAsset(fileName, preferredProjectId, error, type = "image") {
  const uploadProject = preferredProjectId ? getProject(preferredProjectId) : null;
  const isAudio = type === "audio";
  const isVideo = type === "video";
  return {
    type,
    title: fileName.replace(/\.[^.]+$/, "") || "待确认图片素材",
    description: isAudio
      ? "声音素材处理失败，文件已保留，可稍后手动确认归档。"
      : isVideo
        ? "视频素材处理失败，文件已保留，可稍后手动确认归档。"
        : "AI 识别失败，图片已保留，可稍后重新上传或手动确认归档。",
    tags: isAudio ? ["声音素材", "待确认"] : isVideo ? ["视频素材", "待确认"] : ["识别失败", "待确认"],
    projectId: null,
    recommendedProjectId: uploadProject?.id || "unassigned",
    score: 0,
    reason: error.message || "视觉模型暂时不可用。",
    status: "pending",
    thumbnail: isAudio ? makeAudioThumb("音色") : isVideo ? makeVideoThumb("视频") : makeThumb("待确认", "#8b8175", "#d9d2c4", "#9d6b5d"),
    canvasColumnId: isAudio ? "voice" : isVideo ? "output" : ""
  };
}

function cleanAssetText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanAssetTags(value) {
  const tags = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  return tags.length ? [...new Set(tags)].slice(0, 8) : ["AI识别", "图片素材"];
}

function isImageFile(file) {
  return file?.type?.startsWith("image/");
}

function isAudioFile(file) {
  return file?.type?.startsWith("audio/");
}

function isVideoFile(file) {
  return file?.type?.startsWith("video/");
}

function isAudioAsset(asset) {
  return asset?.type === "audio";
}

function isVideoAsset(asset) {
  return asset?.type === "video";
}

function readAudioDuration(file) {
  return readMediaDuration(file, "audio");
}

function readMediaDuration(file, mediaType = "audio") {
  return new Promise((resolve) => {
    const media = mediaType === "video" ? document.createElement("video") : new Audio();
    const url = URL.createObjectURL(file);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    media.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    media.src = url;
  });
}

function formatAudioDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "未知时长";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function normalizeCanvasColumnId(value) {
  return ["source", "state", "scene", "voice", "output"].includes(value) ? value : "";
}

function clampScore(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function analyzeFile(fileName, preferredProjectId = null) {
  const name = normalize(fileName);
  const projects = getProjects();
  const shouldAutoConfirm = preferredProjectId && preferredProjectId !== "all" && preferredProjectId !== "unassigned";
  let projectId =
    shouldAutoConfirm
      ? preferredProjectId
      : "unassigned";
  if (!preferredProjectId) {
    if (/(lulu|噜噜|嘟嘟|toy|bed|kid|儿童|软胶)/i.test(name)) projectId = "lulu";
    if (/(cyber|neon|city|robot|赛博|霓虹|机械|城市)/i.test(name)) projectId = "cyber";
    if (/(ancient|hanfu|palace|fan|古风|古装|折扇|宫)/i.test(name)) projectId = "ancient";
  }
  if (projectId === "unassigned") {
    const customProject = projects
      .filter((project) => project.id !== "unassigned" && !defaultProjects.some((item) => item.id === project.id))
      .find((project) => [project.name, ...project.keywords].some((keyword) => keyword && name.includes(normalize(keyword))));
    if (customProject) projectId = customProject.id;
  }

  const score =
    projectId === "unassigned"
      ? 0.52 + Math.random() * 0.11
      : shouldAutoConfirm
        ? 0.86 + Math.random() * 0.09
        : 0.72 + Math.random() * 0.21;
  const status = shouldAutoConfirm ? "confirmed" : score >= 0.85 ? "recommended" : score >= 0.65 ? "possible" : "pending";
  const project = getProject(projectId);
  const titleMap = {
    lulu: "圆润 IP 道具参考",
    cyber: "赛博短片视觉参考",
    ancient: "古风短剧素材参考",
    unassigned: "待确认图片素材"
  };
  const descriptions = {
    lulu: "主体边缘柔和，色彩偏暖，适合作为儿童向 IP 场景或道具素材。",
    cyber: "画面具有科技、城市或冷暖撞色线索，适合赛博短片氛围素材。",
    ancient: "画面包含传统纹样、古风道具或戏剧化布景线索，适合古风短剧归档。",
    unassigned: "当前图片特征不够集中，建议人工确认后再更新项目画像。"
  };

  return {
    title: titleMap[projectId] || `${project.name}素材参考`,
    description: descriptions[projectId] || `图片与「${project.name}」的项目名或关键词相近，可先归入该项目等待确认。`,
    tags: project.keywords.slice(0, 4),
    projectId: shouldAutoConfirm ? projectId : null,
    recommendedProjectId: projectId,
    score: Number(score.toFixed(2)),
    reason:
      shouldAutoConfirm
        ? `用户在「${project.name}」项目内上传，已直接归档为该项目素材。`
        : projectId === "unassigned"
        ? "文件名和视觉特征没有形成稳定项目指向，进入待确认项目。"
        : `与${project.name}画像中的「${project.keywords.slice(0, 3).join("、")}」相匹配。`,
    status
  };
}

function createProject() {
  const name = els.projectNameInput.value.trim();
  if (!name) return;

  const exists = getProjects().some((project) => normalize(project.name) === normalize(name));
  if (exists) {
    els.projectNameInput.setCustomValidity("项目已存在");
    els.projectNameInput.reportValidity();
    window.setTimeout(() => els.projectNameInput.setCustomValidity(""), 1200);
    return;
  }

  const keywords = parseKeywords(els.projectKeywordsInput.value, name);
  const description =
    els.projectDescInput.value.trim() || `围绕「${name}」自动聚合角色、场景、风格和用途相近的图片素材。`;
  const project = {
    id: `project-${crypto.randomUUID()}`,
    name,
    description,
    keywords,
    signals: [
      `优先匹配项目名「${name}」和关键词`,
      "用户确认后的素材会成为项目画像参考",
      "后续可接入真实 embedding 聚合项目特征"
    ]
  };

  state.projects = insertBeforeUnassigned(getProjects(), project);
  state.feedback.push({
    id: crypto.randomUUID(),
    text: `已新建项目「${name}」`,
    createdAt: new Date().toISOString()
  });
  showToast(`已新建项目「${name}」`);
  activeProject = project.id;
  activeView = "canvas";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === "library");
  });
  els.projectForm.reset();
  els.statusFilter.value = "all";
  saveState();
  render();
}

function deleteProject(projectId) {
  if (!projectId || projectId === "all" || projectId === "unassigned") return;

  const project = getProject(projectId);
  if (!project || project.id === "unassigned") return;

  const affectedAssets = state.assets.filter((asset) => asset.projectId === projectId || asset.recommendedProjectId === projectId);
  const assetNotice = affectedAssets.length
    ? `\n\n该项目内的 ${affectedAssets.length} 张素材不会删除，会移入「待确认项目」。`
    : "";
  const confirmed = window.confirm(`删除项目「${project.name}」？\n\n该项目会从左侧列表和项目画布中移除。${assetNotice}`);
  if (!confirmed) return;

  affectedAssets.forEach((asset) => {
    asset.projectId = null;
    asset.recommendedProjectId = "unassigned";
    asset.status = "pending";
    asset.reason = `原项目「${project.name}」已删除，素材已移入待确认项目等待重新归档。`;
  });

  state.deletedProjectIds = Array.isArray(state.deletedProjectIds) ? state.deletedProjectIds : [];
  if (!state.deletedProjectIds.includes(projectId)) state.deletedProjectIds.push(projectId);
  state.projects = getProjects().filter((item) => item.id !== projectId);
  delete state.canvasLayouts?.[projectId];

  state.feedback.push({
    id: crypto.randomUUID(),
    text: affectedAssets.length
      ? `已删除项目「${project.name}」，${affectedAssets.length} 张素材移入待确认项目`
      : `已删除项目「${project.name}」`,
    createdAt: new Date().toISOString()
  });

  if (activeProject === projectId) {
    activeProject = "all";
    activeView = "library";
    els.projectFilter.value = "all";
    els.statusFilter.value = "all";
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === "library");
    });
  }

  closeProjectMenus();
  showToast(affectedAssets.length ? "项目已删除，素材已移入待确认项目" : "项目已删除");
  saveState();
  render();
}

function getActiveUploadProjectId() {
  if (activeView !== "canvas") return null;
  if (activeProject === "all" || activeProject === "unassigned") return null;
  return getProject(activeProject)?.id || null;
}

function confirmAsset(assetId, projectSelect) {
  const projectId = typeof projectSelect === "string" ? projectSelect : projectSelect.value;
  if (!projectId || projectId === "unassigned") {
    if (typeof projectSelect !== "string") {
      projectSelect.setCustomValidity("请先选择一个项目");
      projectSelect.reportValidity();
      window.setTimeout(() => projectSelect.setCustomValidity(""), 1200);
    }
    return;
  }

  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;
  const project = getProject(projectId);
  const original = getProject(asset.recommendedProjectId);
  asset.projectId = projectId;
  asset.status = "confirmed";
  editingAssetIds.delete(asset.id);
  state.feedback.push({
    id: crypto.randomUUID(),
    text:
      projectId === asset.recommendedProjectId
        ? `已接受「${asset.title}」推荐归档到${project.name}`
        : `已将「${asset.title}」从${original.name}改归档到${project.name}`,
    createdAt: new Date().toISOString()
  });
  showToast(`已确认归档到「${project.name}」`);
  saveState();
  render();
}

function deleteAsset(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;
  const confirmed = window.confirm(`确定删除「${asset.title}」吗？此操作只会从当前素材库移除这条记录。`);
  if (!confirmed) return;

  state.assets = state.assets.filter((item) => item.id !== assetId);
  Object.values(state.canvasLayouts || {}).forEach((layout) => {
    if (layout?.items) delete layout.items[assetId];
  });
  editingAssetIds.delete(assetId);
  state.feedback.push({
    id: crypto.randomUUID(),
    text: `已删除素材「${asset.title}」`,
    createdAt: new Date().toISOString()
  });
  showToast("已删除素材");
  saveState();
  render();
}

function moveToPending(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  editingAssetIds.delete(assetId);
  asset.projectId = null;
  asset.recommendedProjectId = "unassigned";
  asset.status = "pending";
  asset.reason = "用户选择暂不归档，等待后续人工确认或补充项目画像。";
  state.feedback.push({
    id: crypto.randomUUID(),
    text: `已将「${asset.title}」移入待确认项目`,
    createdAt: new Date().toISOString()
  });
  showToast("已移入待确认项目");
  saveState();
  render();
}

function searchSimilar(asset) {
  els.searchInput.value = asset.tags.slice(0, 2).join(" ");
  activeProject = asset.recommendedProjectId;
  els.projectFilter.value = activeProject;
  els.statusFilter.value = "all";
  activeView = "library";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === "library");
  });
  render();
}

async function copyAssetImage(asset) {
  try {
    const blob = await imageSourceToPngBlob(asset.thumbnail);
    if (!window.isSecureContext) {
      downloadBlob(blob, `${asset.title || "image"}.png`);
      showToast("局域网 HTTP 不能复制图片，已改为下载 PNG");
      return;
    }

    if (navigator.clipboard?.write && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("图片已复制，可以粘贴到即梦 AI");
        return;
      } catch (error) {
        console.warn("Image clipboard write failed, falling back.", error);
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(asset.thumbnail);
        showToast("浏览器不支持复制图片，已复制图片数据链接");
        return;
      } catch (error) {
        console.warn("Text clipboard write failed, falling back.", error);
      }
    }

    downloadBlob(blob, `${asset.title || "image"}.png`);
    showToast("当前浏览器不支持复制图片，已下载 PNG");
  } catch (error) {
    console.error(error);
    showToast("复制失败，请右键图片保存后上传");
  }
}

function imageSourceToPngBlob(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas did not produce an image blob."));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Image failed to load for clipboard copy."));
    image.src = source;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFilename(filename);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(value) {
  return String(value || "image.png")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function makeTag(text) {
  const span = document.createElement("span");
  span.className = "tag";
  span.textContent = text;
  return span;
}

function countAssetsForProject(projectId) {
  if (projectId === "all") return state.assets.length;
  return state.assets.filter((asset) => asset.projectId === projectId || asset.recommendedProjectId === projectId)
    .length;
}

function countAssetsByStatus() {
  return state.assets.reduce(
    (counts, asset) => {
      counts[asset.status] = (counts[asset.status] || 0) + 1;
      return counts;
    },
    {
      processing: 0,
      pending: 0,
      recommended: 0,
      possible: 0,
      confirmed: 0
    }
  );
}

function mostActiveProjectId() {
  return getProjects()
    .filter((project) => project.id !== "unassigned")
    .map((project) => ({ id: project.id, count: countAssetsForProject(project.id) }))
    .sort((a, b) => b.count - a.count)[0]?.id;
}

function getProject(id) {
  const projects = getProjects();
  return projects.find((project) => project.id === id) || projects.at(-1);
}

function getProjects() {
  state.projects = normalizeProjects(state.projects, state.deletedProjectIds);
  if (!hasUsableProjects(state.projects)) {
    state.deletedProjectIds = [];
    state.projects = normalizeProjects(defaultProjects, []);
    saveState();
  }
  return state.projects;
}

function hasUsableProjects(projects) {
  return Array.isArray(projects) && projects.some((project) => project.id && project.id !== "unassigned");
}

function repairDeletedProjectIds(deletedProjectIds) {
  const ids = Array.isArray(deletedProjectIds) ? deletedProjectIds.filter(Boolean) : [];
  const defaultIds = defaultProjects.filter((project) => project.id !== "unassigned").map((project) => project.id);
  const deletesEveryDefaultProject = defaultIds.every((id) => ids.includes(id));
  return deletesEveryDefaultProject ? [] : ids;
}

function normalizeProjects(projects, deletedProjectIds = []) {
  const source = Array.isArray(projects) && projects.length ? projects : structuredClone(defaultProjects);
  const merged = [];
  const deleted = new Set(Array.isArray(deletedProjectIds) ? deletedProjectIds : []);
  [...defaultProjects.filter((project) => project.id !== "unassigned"), ...source].forEach((project) => {
    if (!project?.id || merged.some((item) => item.id === project.id)) return;
    if (project.id === "unassigned") return;
    if (deleted.has(project.id)) return;
    merged.push({
      id: project.id,
      name: project.name || "未命名项目",
      description: project.description || "等待补充项目描述。",
      keywords: Array.isArray(project.keywords) && project.keywords.length ? project.keywords : [project.name || "未命名"],
      signals: Array.isArray(project.signals) && project.signals.length ? project.signals : ["根据用户创建的项目关键词进行初步匹配"]
    });
  });
  merged.push(structuredClone(defaultProjects.find((project) => project.id === "unassigned")));
  return merged;
}

function normalizeAssets(assets) {
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const next = { ...asset };
    next.type ||= next.videoSrc ? "video" : next.audioSrc ? "audio" : "image";
    next.thumbnail ||= next.type === "audio" ? makeAudioThumb("音色") : next.type === "video" ? makeVideoThumb("视频") : makeThumb("待确认", "#8b8175", "#d9d2c4", "#9d6b5d");
    if (next.type === "audio") {
      next.canvasColumnId = "voice";
      const tags = cleanAssetTags(next.tags);
      next.tags = tags.includes("声音素材") ? tags : ["声音素材", ...tags].slice(0, 8);
    }
    if (next.type === "video") {
      next.canvasColumnId = "output";
      const tags = cleanAssetTags(next.tags);
      next.tags = tags.includes("视频素材") ? tags : ["视频素材", ...tags].slice(0, 8);
    }
    return next;
  });
}

function insertBeforeUnassigned(projects, project) {
  return [...projects.filter((item) => item.id !== "unassigned"), project, getProject("unassigned")];
}

function parseKeywords(value, fallback) {
  const keywords = value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(keywords.length ? keywords : [fallback])].slice(0, 8);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 1800);
}

function closeAssetMenus() {
  document.querySelectorAll(".card-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".menu-trigger").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

function closeProjectMenus() {
  document.querySelectorAll(".project-menu").forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll(".project-menu-trigger").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
}

function statusLabel(status) {
  return (
    {
      processing: "处理中",
      pending: "待确认",
      recommended: "待快速确认",
      possible: "可能相关",
      confirmed: "已确认"
    }[status] || "全部"
  );
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makeThumb(label, colorA, colorB, colorC) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${colorA}" offset="0"/>
          <stop stop-color="${colorB}" offset="0.58"/>
          <stop stop-color="${colorC}" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="960" height="720" fill="url(#g)"/>
      <rect x="76" y="72" width="808" height="576" rx="42" fill="rgba(255,255,255,.22)"/>
      <circle cx="724" cy="172" r="84" fill="rgba(255,255,255,.26)"/>
      <rect x="150" y="430" width="650" height="62" rx="31" fill="rgba(36,33,29,.2)"/>
      <text x="480" y="370" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, PingFang SC, sans-serif" font-size="86" font-weight="800"
        fill="rgba(255,255,255,.92)">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeAudioThumb(label = "音色") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="audio" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#163f44" offset="0"/>
          <stop stop-color="#147f76" offset="0.54"/>
          <stop stop-color="#e8dcc2" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="960" height="720" fill="url(#audio)"/>
      <rect x="88" y="92" width="784" height="536" rx="46" fill="rgba(255,255,255,.18)"/>
      <g fill="rgba(255,255,255,.86)">
        <rect x="232" y="340" width="36" height="120" rx="18"/>
        <rect x="306" y="280" width="36" height="240" rx="18"/>
        <rect x="380" y="318" width="36" height="164" rx="18"/>
        <rect x="454" y="238" width="36" height="324" rx="18"/>
        <rect x="528" y="300" width="36" height="200" rx="18"/>
        <rect x="602" y="260" width="36" height="280" rx="18"/>
        <rect x="676" y="332" width="36" height="136" rx="18"/>
      </g>
      <text x="480" y="190" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, PingFang SC, sans-serif" font-size="82" font-weight="900"
        fill="rgba(255,255,255,.92)">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeVideoThumb(label = "视频") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="video" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#283756" offset="0"/>
          <stop stop-color="#355b91" offset="0.54"/>
          <stop stop-color="#d9d2c4" offset="1"/>
        </linearGradient>
      </defs>
      <rect width="960" height="720" fill="url(#video)"/>
      <rect x="92" y="96" width="776" height="528" rx="44" fill="rgba(255,255,255,.18)"/>
      <rect x="170" y="170" width="620" height="340" rx="30" fill="rgba(20,20,20,.32)"/>
      <path d="M436 272 L436 408 L560 340 Z" fill="rgba(255,255,255,.9)"/>
      <rect x="220" y="552" width="520" height="34" rx="17" fill="rgba(255,255,255,.45)"/>
      <text x="480" y="112" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, PingFang SC, sans-serif" font-size="72" font-weight="900"
        fill="rgba(255,255,255,.92)">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
