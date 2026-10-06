CREATE TABLE IF NOT EXISTS download_events (
  download_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'completed')),
  release_key TEXT NOT NULL CHECK (release_key IN ('windowsX64', 'windowsArm64', 'macosArm64', 'macosX64')),
  version TEXT NOT NULL CHECK (version = '1.0.0'),
  source_site TEXT NOT NULL CHECK (source_site IN ('cloudflare-pages', 'github-pages')),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (download_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_download_events_created_at
ON download_events (created_at_ms);

CREATE INDEX IF NOT EXISTS idx_download_events_release_created_at
ON download_events (release_key, created_at_ms);

PRAGMA optimize;
