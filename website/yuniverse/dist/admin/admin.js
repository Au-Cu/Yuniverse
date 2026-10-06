const TOKEN_KEY = "yuniverse-download-admin-token";
const RELEASE_LABELS = {
  windowsX64: "Windows x86_64",
  windowsArm64: "Windows ARM64",
  macosArm64: "macOS ARM64",
  macosX64: "macOS x86_64"
};
const SOURCE_LABELS = {
  "cloudflare-pages": "Yuniverse 主站",
  "github-pages": "GitHub Pages"
};

const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const tokenInput = document.querySelector("#admin-token");
const loginError = document.querySelector("#login-error");
const rangeSelect = document.querySelector("#range-select");
const granularitySelect = document.querySelector("#granularity-select");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");

const integer = (value) => Number(value || 0);
const percent = (completed, started) => started ? `${Math.round((completed / started) * 100)}%` : "0%";
const formatter = new Intl.NumberFormat("zh-CN");

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(new Date(timestamp));
}

function formatBucket(timestamp, granularity) {
  const options = granularity === "day"
    ? { month: "2-digit", day: "2-digit" }
    : { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false };
  return new Intl.DateTimeFormat("zh-CN", options).format(new Date(timestamp));
}

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  dashboard.hidden = !authenticated;
}

function logout(message = "") {
  sessionStorage.removeItem(TOKEN_KEY);
  setAuthenticated(false);
  tokenInput.value = "";
  loginError.textContent = message;
  tokenInput.focus();
}

function cell(row, value, strong = false) {
  const td = document.createElement("td");
  if (strong) {
    const element = document.createElement("strong");
    element.textContent = value;
    td.append(element);
  } else {
    td.textContent = value;
  }
  row.append(td);
}

function renderReleaseTable(rows) {
  const tbody = document.querySelector("#release-table");
  tbody.replaceChildren();
  const values = new Map(rows.map((row) => [row.release_key, row]));
  for (const [key, label] of Object.entries(RELEASE_LABELS)) {
    const data = values.get(key) || {};
    const started = integer(data.started);
    const completed = integer(data.completed);
    const tr = document.createElement("tr");
    cell(tr, label, true);
    cell(tr, formatter.format(started));
    cell(tr, formatter.format(completed));
    cell(tr, percent(completed, started));
    tbody.append(tr);
  }
}

function renderSourceTable(rows) {
  const tbody = document.querySelector("#source-table");
  tbody.replaceChildren();
  const values = new Map(rows.map((row) => [row.source_site, row]));
  for (const [key, label] of Object.entries(SOURCE_LABELS)) {
    const data = values.get(key) || {};
    const tr = document.createElement("tr");
    cell(tr, label, true);
    cell(tr, formatter.format(integer(data.started)));
    cell(tr, formatter.format(integer(data.completed)));
    tbody.append(tr);
  }
}

function renderTimeline(rows, granularity) {
  const timeline = document.querySelector("#timeline");
  timeline.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "所选时段还没有下载记录";
    timeline.append(empty);
    return;
  }

  const max = Math.max(1, ...rows.flatMap((row) => [integer(row.started), integer(row.completed)]));
  rows.forEach((row, index) => {
    const bucket = document.createElement("div");
    bucket.className = "bucket";
    bucket.title = `${formatDateTime(row.bucket_start_ms)} · 开始 ${integer(row.started)} · 完成 ${integer(row.completed)}`;

    const bars = document.createElement("div");
    bars.className = "bucket-bars";
    for (const type of ["started", "completed"]) {
      const bar = document.createElement("i");
      bar.className = `bucket-bar ${type}`;
      bar.style.height = `${Math.max(2, (integer(row[type]) / max) * 100)}%`;
      bars.append(bar);
    }

    const label = document.createElement("span");
    label.className = "bucket-label";
    const labelEvery = Math.max(1, Math.ceil(rows.length / 9));
    label.textContent = index % labelEvery === 0 ? formatBucket(row.bucket_start_ms, granularity) : "";
    bucket.append(bars, label);
    timeline.append(bucket);
  });
}

function renderRecent(rows) {
  const tbody = document.querySelector("#recent-table");
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "还没有下载记录";
    tr.append(td);
    tbody.append(tr);
    return;
  }

  for (const event of rows) {
    const tr = document.createElement("tr");
    cell(tr, formatDateTime(event.created_at_ms));
    const status = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `event-pill ${event.event_type}`;
    pill.textContent = event.event_type === "completed" ? "完成" : "开始";
    status.append(pill);
    tr.append(status);
    cell(tr, RELEASE_LABELS[event.release_key] || event.release_key, true);
    cell(tr, SOURCE_LABELS[event.source_site] || event.source_site);
    cell(tr, `${event.download_id.slice(0, 8)}…`);
    tbody.append(tr);
  }
}

async function loadStats() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return logout();

  refreshButton.disabled = true;
  refreshButton.textContent = "读取中…";
  const to = Date.now();
  const rangeMs = Number(rangeSelect.value);
  const params = new URLSearchParams({
    granularity: granularitySelect.value,
    from: String(to - rangeMs),
    to: String(to),
    limit: "100"
  });

  try {
    const response = await fetch(`../api/download-stats?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) return logout("管理口令不正确，请重新输入。");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    setAuthenticated(true);
    const started = integer(data.summary.started);
    const completed = integer(data.summary.completed);
    document.querySelector("#total-started").textContent = formatter.format(started);
    document.querySelector("#total-completed").textContent = formatter.format(completed);
    document.querySelector("#completion-rate").textContent = percent(completed, started);
    document.querySelector("#range-completed").textContent = formatter.format(integer(data.rangeSummary.completed));
    document.querySelector("#range-caption").textContent = rangeSelect.options[rangeSelect.selectedIndex].textContent;
    document.querySelector("#updated-at").textContent = `更新于 ${formatDateTime(data.generatedAt)} · 当前浏览器本地时间`;
    renderReleaseTable(data.byRelease || []);
    renderSourceTable(data.bySource || []);
    renderTimeline(data.timeline || [], data.range.granularity);
    renderRecent(data.recent || []);
  } catch (error) {
    console.error(error);
    document.querySelector("#updated-at").textContent = "统计暂时无法读取，请稍后刷新。";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "刷新";
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;
  sessionStorage.setItem(TOKEN_KEY, token);
  loginError.textContent = "";
  loadStats();
});

refreshButton.addEventListener("click", loadStats);
logoutButton.addEventListener("click", () => logout());
rangeSelect.addEventListener("change", loadStats);
granularitySelect.addEventListener("change", loadStats);

if (sessionStorage.getItem(TOKEN_KEY)) {
  setAuthenticated(true);
  loadStats();
} else {
  setAuthenticated(false);
}
