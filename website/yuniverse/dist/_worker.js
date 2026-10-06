const RELEASE_KEYS = new Set(["windowsX64", "windowsArm64", "macosArm64", "macosX64"]);
const EVENT_TYPES = new Set(["started", "completed"]);
const GRANULARITIES = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000
};
const DEFAULT_WINDOWS = {
  minute: 24 * GRANULARITIES.hour,
  hour: 30 * GRANULARITIES.day,
  day: 365 * GRANULARITIES.day
};

function allowedOrigin(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (
      url.hostname === "yuniverse411.pages.dev" ||
      url.hostname.endsWith(".yuniverse411.pages.dev") ||
      url.hostname === "au-cu.github.io"
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  if (!allowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function validDownloadId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(value);
}

function sourceForOrigin(origin) {
  return new URL(origin).hostname === "au-cu.github.io" ? "github-pages" : "cloudflare-pages";
}

async function recordDownloadEvent(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = corsHeaders(origin);
  if (!allowedOrigin(origin)) return json({ ok: false, error: "origin_not_allowed" }, 403);
  if (!env.DOWNLOADS_DB) return json({ ok: false, error: "storage_unavailable" }, 503, headers);

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > 2048) return json({ ok: false, error: "payload_too_large" }, 413, headers);

  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400, headers);
  }

  const { downloadId, event, releaseKey, version } = payload || {};
  if (
    !validDownloadId(downloadId) ||
    !EVENT_TYPES.has(event) ||
    !RELEASE_KEYS.has(releaseKey) ||
    version !== "1.0.0"
  ) {
    return json({ ok: false, error: "invalid_event" }, 400, headers);
  }

  const result = await env.DOWNLOADS_DB.prepare(`
    INSERT OR IGNORE INTO download_events
      (download_id, event_type, release_key, version, source_site, created_at_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(downloadId, event, releaseKey, version, sourceForOrigin(origin), Date.now()).run();

  return json({ ok: true, recorded: (result.meta?.changes || 0) > 0 }, 200, headers);
}

function parseInteger(value, fallback, min, max) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function readDownloadStats(request, env) {
  if (!env.DOWNLOADS_DB || !env.ADMIN_TOKEN) {
    return json({ ok: false, error: "stats_unavailable" }, 503);
  }

  const authorization = request.headers.get("Authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(suppliedToken, env.ADMIN_TOKEN)) {
    return json({ ok: false, error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  }

  const url = new URL(request.url);
  const granularity = Object.hasOwn(GRANULARITIES, url.searchParams.get("granularity"))
    ? url.searchParams.get("granularity")
    : "hour";
  const bucketMs = GRANULARITIES[granularity];
  const now = Date.now();
  const from = parseInteger(
    url.searchParams.get("from"),
    now - DEFAULT_WINDOWS[granularity],
    0,
    now + GRANULARITIES.day
  );
  const to = parseInteger(url.searchParams.get("to"), now, from + 1, now + GRANULARITIES.day);
  const limit = parseInteger(url.searchParams.get("limit"), 60, 1, 200);

  const [summary, rangeSummary, byRelease, bySource, timeline, recent] = await Promise.all([
    env.DOWNLOADS_DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'started' THEN 1 ELSE 0 END), 0) AS started,
        COALESCE(SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END), 0) AS completed
      FROM download_events
    `).first(),
    env.DOWNLOADS_DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN event_type = 'started' THEN 1 ELSE 0 END), 0) AS started,
        COALESCE(SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END), 0) AS completed
      FROM download_events
      WHERE created_at_ms >= ? AND created_at_ms < ?
    `).bind(from, to).first(),
    env.DOWNLOADS_DB.prepare(`
      SELECT release_key,
        SUM(CASE WHEN event_type = 'started' THEN 1 ELSE 0 END) AS started,
        SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM download_events
      GROUP BY release_key
      ORDER BY completed DESC, started DESC
    `).all(),
    env.DOWNLOADS_DB.prepare(`
      SELECT source_site,
        SUM(CASE WHEN event_type = 'started' THEN 1 ELSE 0 END) AS started,
        SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM download_events
      GROUP BY source_site
      ORDER BY completed DESC, started DESC
    `).all(),
    env.DOWNLOADS_DB.prepare(`
      SELECT
        CAST(created_at_ms / ? AS INTEGER) * ? AS bucket_start_ms,
        SUM(CASE WHEN event_type = 'started' THEN 1 ELSE 0 END) AS started,
        SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM download_events
      WHERE created_at_ms >= ? AND created_at_ms < ?
      GROUP BY bucket_start_ms
      ORDER BY bucket_start_ms ASC
    `).bind(bucketMs, bucketMs, from, to).all(),
    env.DOWNLOADS_DB.prepare(`
      SELECT download_id, event_type, release_key, version, source_site, created_at_ms
      FROM download_events
      ORDER BY created_at_ms DESC
      LIMIT ?
    `).bind(limit).all()
  ]);

  return json({
    ok: true,
    generatedAt: now,
    precision: "millisecond",
    range: { from, to, granularity, bucketMs },
    summary: summary || { started: 0, completed: 0 },
    rangeSummary: rangeSummary || { started: 0, completed: 0 },
    byRelease: byRelease.results || [],
    bySource: bySource.results || [],
    timeline: timeline.results || [],
    recent: recent.results || []
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/download-event") {
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin") || "";
        return allowedOrigin(origin)
          ? new Response(null, { status: 204, headers: corsHeaders(origin) })
          : json({ ok: false, error: "origin_not_allowed" }, 403);
      }
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      try {
        return await recordDownloadEvent(request, env);
      } catch (error) {
        console.error("download event write failed", error);
        return json({ ok: false, error: "write_failed" }, 503, corsHeaders(request.headers.get("Origin") || ""));
      }
    }

    if (url.pathname === "/api/download-stats") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      try {
        return await readDownloadStats(request, env);
      } catch (error) {
        console.error("download stats read failed", error);
        return json({ ok: false, error: "read_failed" }, 503);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
