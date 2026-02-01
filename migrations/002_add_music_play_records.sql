-- ============================================
-- MoonTV Plus - 音乐播放记录表
-- 版本: 1.1.0
-- 创建时间: 2026-02-01
-- ============================================

-- 音乐播放记录表
CREATE TABLE IF NOT EXISTS music_play_records (
  username TEXT NOT NULL,
  key TEXT NOT NULL, -- format: "platform+id" (e.g., "netease+12345")
  platform TEXT NOT NULL CHECK(platform IN ('netease', 'qq', 'kuwo')), -- 音乐平台
  song_id TEXT NOT NULL, -- 歌曲ID
  name TEXT NOT NULL, -- 歌曲名
  artist TEXT NOT NULL, -- 艺术家
  album TEXT, -- 专辑（可选）
  pic TEXT, -- 封面图URL（可选）
  play_time REAL NOT NULL DEFAULT 0, -- 播放进度（秒）
  duration REAL NOT NULL DEFAULT 0, -- 总时长（秒）
  save_time INTEGER NOT NULL, -- 保存时间戳
  PRIMARY KEY (username, key),
  FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_music_play_records_username ON music_play_records(username);
CREATE INDEX IF NOT EXISTS idx_music_play_records_save_time ON music_play_records(username, save_time DESC);
CREATE INDEX IF NOT EXISTS idx_music_play_records_platform ON music_play_records(username, platform);
