import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pg from 'pg';
const { Pool } = pg;
import sharp from 'sharp';
import archiver from 'archiver';
import { randomUUID } from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const PORT = Number(process.env.PORT || 4500);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://oak:oaklocal@db:5432/oak_expenses';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://host.docker.internal:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';
const STORAGE = process.env.SOCIAL_STORAGE_ROOT || '/app/storage';
const AGENT_TICK_MS = Number(process.env.SOCIAL_AGENT_TICK_MS || 900000);
const BUILD = 'oak-social-studio-v1.1-brand-editor';

const DIRS = {
  assets: path.join(STORAGE, 'assets'),
  thumbs: path.join(STORAGE, 'thumbs'),
  renders: path.join(STORAGE, 'renders'),
  exports: path.join(STORAGE, 'exports'),
  tmp: path.join(STORAGE, 'tmp')
};
for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/files/assets', express.static(DIRS.assets));
app.use('/files/thumbs', express.static(DIRS.thumbs));
app.use('/files/renders', express.static(DIRS.renders));
app.use('/files/exports', express.static(DIRS.exports));

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function safeFilename(name = 'file') {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  return `${Date.now()}-${randomUUID()}${ext}`;
}

function mediaTypeFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map(v => v.trim()).filter(Boolean);
  } catch {}
  return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

function relativeUrl(kind, file) {
  if (!file) return null;
  return `/files/${kind}/${encodeURIComponent(path.basename(file))}`;
}

function serializeAsset(row) {
  return {
    ...row,
    url: relativeUrl('assets', row.stored_name),
    thumbnail_url: row.thumbnail_name ? relativeUrl('thumbs', row.thumbnail_name) : null
  };
}

function serializeProject(row) {
  return {
    ...row,
    render_url: row.render_path ? relativeUrl('renders', row.render_path) : null,
    cover_url: row.cover_path ? relativeUrl('renders', row.cover_path) : null,
    export_url: row.export_path ? relativeUrl('exports', row.export_path) : null
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oak_social_brand (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      brand_name TEXT NOT NULL DEFAULT 'Oak Lounge',
      tone TEXT NOT NULL DEFAULT 'Premium, warm, modern and international',
      languages TEXT[] NOT NULL DEFAULT ARRAY['English','Simplified Chinese'],
      brand_rules TEXT NOT NULL DEFAULT 'Use real Oak Lounge photos first. Keep visuals premium and uncluttered. Avoid misleading offers and excessive emojis.',
      default_cta TEXT NOT NULL DEFAULT 'Visit Oak Lounge',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO oak_social_brand (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS oak_social_assets (
      id UUID PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      thumbnail_name TEXT,
      mime_type TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      duration_seconds NUMERIC(10,2),
      tags TEXT[] NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_social_campaigns (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      brief TEXT NOT NULL,
      objective TEXT NOT NULL DEFAULT '',
      languages TEXT[] NOT NULL DEFAULT '{}',
      platforms TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'manual',
      ai_proposal JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_social_projects (
      id UUID PRIMARY KEY,
      campaign_id UUID REFERENCES oak_social_campaigns(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'still',
      title TEXT NOT NULL DEFAULT '',
      hook TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      hashtags TEXT[] NOT NULL DEFAULT '{}',
      language TEXT NOT NULL DEFAULT 'English',
      aspect_ratio TEXT NOT NULL DEFAULT '4:5',
      duration_seconds INTEGER NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'draft',
      scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
      scheduled_for TIMESTAMPTZ,
      render_path TEXT,
      cover_path TEXT,
      export_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS oak_social_agent_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      weekday INTEGER NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 1 AND 7),
      hour INTEGER NOT NULL DEFAULT 9 CHECK (hour BETWEEN 0 AND 23),
      platforms TEXT[] NOT NULL DEFAULT ARRAY['instagram','redbook','wechat_channels','tiktok'],
      goal TEXT NOT NULL DEFAULT 'Create a premium weekly Oak Lounge campaign using recent real photos and videos.',
      last_run_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    INSERT INTO oak_social_agent_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS oak_social_audit (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS primary_color TEXT NOT NULL DEFAULT '#855d3b';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#d9b382';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS text_color TEXT NOT NULL DEFAULT '#ffffff';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS font_family TEXT NOT NULL DEFAULT 'Noto Sans CJK SC';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS default_template TEXT NOT NULL DEFAULT 'classic';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS watermark_position TEXT NOT NULL DEFAULT 'bottom-left';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS default_subtitle_mode TEXT NOT NULL DEFAULT 'bilingual';
    ALTER TABLE oak_social_brand ADD COLUMN IF NOT EXISTS logo_asset_id UUID;

    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS template_style TEXT NOT NULL DEFAULT 'classic';
    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS subtitle_mode TEXT NOT NULL DEFAULT 'bilingual';
    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS cover_asset_id UUID;
    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS music_asset_id UUID;
    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS music_volume NUMERIC(4,2) NOT NULL DEFAULT 0.18;
    ALTER TABLE oak_social_projects ADD COLUMN IF NOT EXISTS platform_preset TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS oak_social_projects_scheduled_idx ON oak_social_projects(scheduled_for);
    CREATE INDEX IF NOT EXISTS oak_social_assets_created_idx ON oak_social_assets(created_at DESC);
  `);
}

async function audit(action, entityType, entityId, detail = {}) {
  await pool.query(
    `INSERT INTO oak_social_audit(action, entity_type, entity_id, detail) VALUES ($1,$2,$3,$4)`,
    [action, entityType, entityId || null, detail]
  );
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DIRS.assets),
    filename: (_req, file, cb) => cb(null, safeFilename(file.originalname))
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    const type = mediaTypeFromMime(file.mimetype);
    cb(type === 'other' ? new Error(`Unsupported media type: ${file.mimetype}`) : null, type !== 'other');
  }
});

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2500)}`));
    });
  });
}

async function probeMedia(filePath) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath
    ]);
    const parsed = JSON.parse(stdout);
    const video = (parsed.streams || []).find(s => s.codec_type === 'video');
    return {
      width: Number(video?.width || 0) || null,
      height: Number(video?.height || 0) || null,
      duration: Number(parsed.format?.duration || video?.duration || 0) || null
    };
  } catch {
    return { width: null, height: null, duration: null };
  }
}

async function makeThumbnail(assetPath, mediaType, storedName) {
  const thumbName = `${path.parse(storedName).name}.jpg`;
  const thumbPath = path.join(DIRS.thumbs, thumbName);
  try {
    if (mediaType === 'image') {
      await sharp(assetPath).rotate().resize(520, 520, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(thumbPath);
      return thumbName;
    }
    if (mediaType === 'video') {
      await run('ffmpeg', ['-y', '-ss', '0.2', '-i', assetPath, '-frames:v', '1', '-vf', 'scale=520:-2', thumbPath]);
      return thumbName;
    }
  } catch (err) {
    console.warn('Thumbnail failed:', err.message);
  }
  return null;
}

async function fetchOllamaJson(system, user, schema, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        format: schema,
        options: { temperature: 0.35 }
      }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`Ollama returned HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const content = data?.message?.content || data?.response || '';
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

const campaignSchema = {
  type: 'object',
  required: ['campaign_title', 'summary', 'posts'],
  properties: {
    campaign_title: { type: 'string' },
    summary: { type: 'string' },
    posts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['platform', 'format', 'language', 'title', 'hook', 'caption', 'hashtags', 'aspect_ratio', 'duration_seconds', 'scenes'],
        properties: {
          platform: { type: 'string' },
          format: { type: 'string', enum: ['still', 'carousel', 'short_video'] },
          language: { type: 'string' },
          title: { type: 'string' },
          hook: { type: 'string' },
          caption: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
          aspect_ratio: { type: 'string', enum: ['9:16', '4:5', '1:1', '16:9'] },
          duration_seconds: { type: 'integer', minimum: 3, maximum: 90 },
          scenes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['asset_id', 'duration_seconds', 'overlay', 'notes'],
              properties: {
                asset_id: { type: 'string' },
                duration_seconds: { type: 'number', minimum: 1, maximum: 20 },
                overlay: { type: 'string' },
                notes: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

async function buildCampaignProposal({ brief, objective = '', platforms = [], languages = [], assetIds = [] }) {
  const brand = (await pool.query('SELECT * FROM oak_social_brand WHERE id=1')).rows[0];
  let assets = [];
  if (assetIds.length) {
    const q = await pool.query(`SELECT id, original_name, media_type, tags, notes FROM oak_social_assets WHERE id = ANY($1::uuid[]) AND is_active=true`, [assetIds]);
    assets = q.rows;
  }
  const allowedIds = new Set(assets.map(a => a.id));
  const assetText = assets.length
    ? assets.map(a => `- ${a.id} | ${a.media_type} | ${a.original_name} | tags: ${(a.tags || []).join(', ')} | notes: ${a.notes || ''}`).join('\n')
    : '- No assets selected yet. Use an empty asset_id in scenes and write clear scene notes so the user can attach media later.';

  const system = `You are Oak Social Agent, the bilingual social-media creative planner for ${brand.brand_name}.\n` +
    `Brand tone: ${brand.tone}.\nBrand rules: ${brand.brand_rules}.\n` +
    `Default languages: ${(brand.languages || []).join(', ')}.\n` +
    `Create platform-native content, not literal copy-paste translations. Instagram/Facebook can be international/English-forward; RED/Xiaohongshu should be Chinese-first lifestyle content; WeChat Channels should be community-friendly and bilingual where useful; TikTok should have a fast hook.\n` +
    `Use real supplied Oak assets first. Never invent a promotion, price, event, celebrity, opening hour, or factual claim not present in the brief. Avoid content aimed at minors. For shisha/tobacco-related material, keep wording adult-oriented and conservative.\n` +
    `Return only data matching the JSON schema. For asset_id, use ONLY IDs supplied below, or an empty string if no suitable asset exists.`;

  const user = `Campaign brief:\n${brief}\n\nObjective:\n${objective || 'Build awareness and visits to Oak Lounge.'}\n\nRequested platforms: ${platforms.join(', ') || 'Instagram, Facebook, Redbook, WeChat Channels, TikTok'}\nRequested languages: ${languages.join(', ') || (brand.languages || []).join(', ')}\n\nAvailable assets:\n${assetText}\n\nCreate one strong draft for each requested platform. Keep short-video scene plans editable and practical. For still/carousel posts, scenes represent image slots.`;

  const proposal = await fetchOllamaJson(system, user, campaignSchema);
  proposal.posts = (proposal.posts || []).map(post => ({
    ...post,
    platform: String(post.platform || '').toLowerCase().replace(/\s+/g, '_'),
    scenes: (post.scenes || []).map(scene => ({
      ...scene,
      asset_id: allowedIds.has(scene.asset_id) ? scene.asset_id : ''
    }))
  }));
  return proposal;
}

async function saveCampaignFromProposal({ brief, objective, platforms, languages, proposal, source = 'manual' }) {
  const brandDefaults = (await pool.query('SELECT default_template, default_subtitle_mode FROM oak_social_brand WHERE id=1')).rows[0] || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campaignId = randomUUID();
    await client.query(`
      INSERT INTO oak_social_campaigns(id,title,brief,objective,languages,platforms,status,source,ai_proposal)
      VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8)
    `, [campaignId, proposal.campaign_title || 'Oak Social Campaign', brief, objective || '', languages || [], platforms || [], source, proposal]);

    const projects = [];
    for (const post of proposal.posts || []) {
      const id = randomUUID();
      const row = (await client.query(`
        INSERT INTO oak_social_projects(
          id,campaign_id,platform,format,title,hook,caption,hashtags,language,aspect_ratio,duration_seconds,status,scenes,template_style,subtitle_mode
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14)
        RETURNING *
      `, [
        id, campaignId, post.platform || 'instagram', post.format || 'still', post.title || '', post.hook || '',
        post.caption || '', post.hashtags || [], post.language || 'English', post.aspect_ratio || '4:5',
        Number(post.duration_seconds || 15), JSON.stringify(post.scenes || []),
        brandDefaults.default_template || 'classic', brandDefaults.default_subtitle_mode || 'bilingual'
      ])).rows[0];
      projects.push(row);
    }
    await client.query('COMMIT');
    await audit('campaign_created', 'campaign', campaignId, { source, project_count: projects.length });
    return { campaign_id: campaignId, projects: projects.map(serializeProject) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function dimensionsForRatio(ratio = '4:5') {
  if (ratio === '9:16') return { width: 1080, height: 1920 };
  if (ratio === '1:1') return { width: 1080, height: 1080 };
  if (ratio === '16:9') return { width: 1920, height: 1080 };
  return { width: 1080, height: 1350 };
}

function escXml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[ch]));
}

function safeHex(value, fallback = '#ffffff') {
  const v = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function sceneCropPosition(value = 'center') {
  const allowed = new Set(['center','top','bottom','left','right']);
  return allowed.has(value) ? value : 'center';
}

function sharpPosition(value = 'center') {
  return ({ center:'centre', top:'north', bottom:'south', left:'west', right:'east' })[sceneCropPosition(value)] || 'centre';
}

function ffmpegCrop(width, height, value = 'center') {
  const pos = sceneCropPosition(value);
  const x = pos === 'left' ? '0' : pos === 'right' ? 'iw-ow' : '(iw-ow)/2';
  const y = pos === 'top' ? '0' : pos === 'bottom' ? 'ih-oh' : '(ih-oh)/2';
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:${x}:${y}`;
}

async function getBrandContext() {
  const brand = (await pool.query('SELECT * FROM oak_social_brand WHERE id=1')).rows[0];
  let logoPath = null;
  if (brand?.logo_asset_id) {
    const logo = (await pool.query(`SELECT * FROM oak_social_assets WHERE id=$1 AND is_active=true AND media_type='image'`, [brand.logo_asset_id])).rows[0];
    if (logo) {
      const candidate = path.join(DIRS.assets, logo.stored_name);
      if (fs.existsSync(candidate)) logoPath = candidate;
    }
  }
  return { brand, logoPath };
}

function wrapLines(text = '', maxChars = 28, maxLines = 4) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const words = /\s/.test(raw) ? raw.split(/\s+/) : Array.from(raw);
  const lines = [];
  let current = '';
  for (const word of words) {
    const sep = /\s/.test(raw) ? ' ' : '';
    const candidate = current ? current + sep + word : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function overlaySvg({ width, height, title = '', overlay = '', subtitle = '', brand = {}, textPosition = 'bottom', templateStyle = 'classic' }) {
  const headline = wrapLines(overlay || title, width > height ? 34 : 24, 4);
  const subtitleLines = wrapLines(subtitle, width > height ? 52 : 34, 2);
  const lineHeight = Math.round(height * 0.045);
  const subtitleLineHeight = Math.round(height * 0.032);
  const fontSize = Math.max(34, Math.round(height * 0.036));
  const subtitleSize = Math.max(22, Math.round(height * 0.023));
  const brandSize = Math.max(19, Math.round(height * 0.018));
  const primary = safeHex(brand.primary_color, '#855d3b');
  const accent = safeHex(brand.accent_color, '#d9b382');
  const textColor = safeHex(brand.text_color, '#ffffff');
  const fontFamily = escXml(brand.font_family || 'Noto Sans CJK SC');
  const position = ['top','center','bottom'].includes(textPosition) ? textPosition : 'bottom';
  const style = ['classic','minimal','clean'].includes(templateStyle) ? templateStyle : 'classic';
  const contentHeight = Math.max(145, headline.length * lineHeight + subtitleLines.length * subtitleLineHeight + 92);
  const y0 = position === 'top' ? Math.round(height * 0.08) : position === 'center' ? Math.round((height - contentHeight) / 2) : height - contentHeight - Math.round(height * 0.065);
  const textY = y0 + 56;
  const tspans = headline.map((line, i) => `<tspan x="${Math.round(width * 0.07)}" dy="${i === 0 ? 0 : lineHeight}">${escXml(line)}</tspan>`).join('');
  const subY = textY + Math.max(1, headline.length) * lineHeight + 10;
  const subtspans = subtitleLines.map((line, i) => `<tspan x="${Math.round(width * 0.07)}" dy="${i === 0 ? 0 : subtitleLineHeight}">${escXml(line)}</tspan>`).join('');
  const bg = style === 'minimal'
    ? `<rect x="${Math.round(width * 0.045)}" y="${Math.max(0,y0-18)}" width="${Math.round(width * 0.91)}" height="${contentHeight}" rx="18" fill="#000" fill-opacity="0.42"/>`
    : style === 'clean'
      ? `<rect x="0" y="${Math.max(0,y0-28)}" width="${width}" height="${contentHeight+50}" fill="#0d0d0d" fill-opacity="0.82"/><rect x="${Math.round(width*0.07)}" y="${Math.max(0,y0-28)}" width="${Math.round(width*0.11)}" height="6" fill="${accent}"/>`
      : `<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient></defs><rect x="0" y="${Math.max(0,y0-100)}" width="${width}" height="${contentHeight+120}" fill="url(#fade)"/><rect x="${Math.round(width*0.07)}" y="${Math.max(0,y0+12)}" width="${Math.round(width*0.08)}" height="5" fill="${primary}"/>`;
  const wm = brand.watermark_position || 'bottom-left';
  const wmX = wm.endsWith('right') ? Math.round(width * 0.93) : Math.round(width * 0.07);
  const wmAnchor = wm.endsWith('right') ? 'end' : 'start';
  const wmY = wm.startsWith('top') ? Math.round(height * 0.07) : Math.round(height * 0.955);
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${bg}
      <text x="${Math.round(width * 0.07)}" y="${textY}" fill="${textColor}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700">${tspans}</text>
      ${subtitleLines.length ? `<text x="${Math.round(width * 0.07)}" y="${subY}" fill="${textColor}" fill-opacity="0.92" font-family="${fontFamily}" font-size="${subtitleSize}" font-weight="500">${subtspans}</text>` : ''}
      <text x="${wmX}" y="${wmY}" text-anchor="${wmAnchor}" fill="${textColor}" fill-opacity="0.88" font-family="${fontFamily}" font-size="${brandSize}" font-weight="600">${escXml(brand.brand_name || 'Oak Lounge')}</text>
    </svg>
  `);
}

async function getAssetMap(ids) {
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (!clean.length) return new Map();
  const rows = (await pool.query(`SELECT * FROM oak_social_assets WHERE id = ANY($1::uuid[]) AND is_active=true`, [clean])).rows;
  return new Map(rows.map(r => [r.id, r]));
}

async function frameFromVideo(assetPath) {
  const output = path.join(DIRS.tmp, `frame-${randomUUID()}.jpg`);
  await run('ffmpeg', ['-y', '-ss', '0.2', '-i', assetPath, '-frames:v', '1', output]);
  return output;
}

function sceneSubtitle(scene = {}, mode = 'none') {
  const en = String(scene.subtitle_en || '').trim();
  const zh = String(scene.subtitle_zh || '').trim();
  if (mode === 'english') return en;
  if (mode === 'chinese') return zh;
  if (mode === 'bilingual') return [en, zh].filter(Boolean).join('  ·  ');
  return '';
}

async function buildOverlayPng({ width, height, text, subtitle = '', brand, logoPath, textPosition = 'bottom', templateStyle = 'classic' }) {
  const svg = overlaySvg({ width, height, overlay: text, subtitle, brand: logoPath ? { ...brand, brand_name: '' } : brand, textPosition, templateStyle });
  let canvas = sharp(svg).png();
  if (logoPath) {
    try {
      const logoWidth = Math.max(70, Math.round(width * 0.13));
      const logo = await sharp(logoPath).rotate().resize({ width: logoWidth, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const meta = await sharp(logo).metadata();
      const margin = Math.round(width * 0.045);
      const pos = brand.watermark_position || 'bottom-left';
      const left = pos.endsWith('right') ? Math.max(0, width - (meta.width || logoWidth) - margin) : margin;
      const top = pos.startsWith('top') ? margin : Math.max(0, height - (meta.height || logoWidth) - margin);
      canvas = canvas.composite([{ input: logo, left, top, blend: 'over' }]);
    } catch {}
  }
  return await canvas.toBuffer();
}

async function renderStill(project) {
  const { width, height } = dimensionsForRatio(project.aspect_ratio);
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const ids = [...scenes.map(s => s.asset_id).filter(Boolean), project.cover_asset_id].filter(Boolean);
  const assetMap = await getAssetMap(ids);
  const coverScene = project.cover_asset_id ? { ...(scenes.find(s => s.asset_id === project.cover_asset_id) || {}), asset_id: project.cover_asset_id } : null;
  const first = coverScene || scenes.find(s => assetMap.has(s.asset_id));
  const { brand, logoPath } = await getBrandContext();
  const outputName = `social-${project.id}-${Date.now()}.jpg`;
  const outputPath = path.join(DIRS.renders, outputName);
  let base;
  let tempFrame = null;
  try {
    if (first && assetMap.has(first.asset_id)) {
      const asset = assetMap.get(first.asset_id);
      let source = path.join(DIRS.assets, asset.stored_name);
      if (asset.media_type === 'video') {
        tempFrame = await frameFromVideo(source);
        source = tempFrame;
      }
      base = sharp(source).rotate().resize(width, height, { fit: 'cover', position: sharpPosition(first.crop_position || 'center') });
    } else {
      base = sharp({ create: { width, height, channels: 3, background: '#171717' } });
    }
    const overlay = await buildOverlayPng({
      width, height,
      text: first?.overlay || project.hook || project.title,
      subtitle: sceneSubtitle(first || {}, project.subtitle_mode),
      brand, logoPath,
      textPosition: first?.text_position || 'bottom',
      templateStyle: project.template_style || brand.default_template || 'classic'
    });
    await base.composite([{ input: overlay, top: 0, left: 0 }]).jpeg({ quality: 90 }).toFile(outputPath);
  } finally {
    if (tempFrame) await fsp.rm(tempFrame, { force: true }).catch(() => {});
  }
  await pool.query(`UPDATE oak_social_projects SET cover_path=$1, updated_at=now() WHERE id=$2`, [outputName, project.id]);
  await audit('cover_rendered', 'project', project.id, { output: outputName, cover_asset_id: project.cover_asset_id || null });
  return outputName;
}

async function makeOverlayPng(opts) {
  const name = `overlay-${randomUUID()}.png`;
  const file = path.join(DIRS.tmp, name);
  await fsp.writeFile(file, await buildOverlayPng(opts));
  return file;
}

async function renderVideo(project) {
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  if (!scenes.length) throw new Error('Add at least one scene before rendering video.');
  const { width, height } = dimensionsForRatio(project.aspect_ratio || '9:16');
  const assetMap = await getAssetMap([...scenes.map(s => s.asset_id), project.music_asset_id]);
  const { brand, logoPath } = await getBrandContext();
  const work = path.join(DIRS.tmp, `video-${project.id}-${Date.now()}`);
  await fsp.mkdir(work, { recursive: true });
  const segmentFiles = [];
  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const asset = assetMap.get(scene.asset_id);
      if (!asset) continue;
      const input = path.join(DIRS.assets, asset.stored_name);
      const duration = Math.max(1, Math.min(20, Number(scene.duration_seconds || 3)));
      const overlay = await makeOverlayPng({
        width, height,
        text: scene.overlay || project.hook || project.title,
        subtitle: sceneSubtitle(scene, project.subtitle_mode),
        brand, logoPath,
        textPosition: scene.text_position || 'bottom',
        templateStyle: project.template_style || brand.default_template || 'classic'
      });
      const seg = path.join(work, `segment-${String(i).padStart(2, '0')}.mp4`);
      const base = `[0:v]${ffmpegCrop(width, height, scene.crop_position || 'center')}[bg];[bg][1:v]overlay=0:0,format=yuv420p`;
      const fadeDur = Math.min(0.35, duration / 4);
      const transition = scene.transition === 'fade' ? `,fade=t=in:st=0:d=${fadeDur.toFixed(2)},fade=t=out:st=${Math.max(0,duration-fadeDur).toFixed(2)}:d=${fadeDur.toFixed(2)}` : '';
      const filter = `${base}${transition}[v]`;
      const args = ['-y'];
      if (asset.media_type === 'image') args.push('-loop', '1', '-i', input);
      else if (asset.media_type === 'video') args.push('-i', input);
      else { await fsp.rm(overlay, { force: true }); continue; }
      args.push('-loop', '1', '-i', overlay, '-t', String(duration), '-filter_complex', filter, '-map', '[v]', '-r', '30', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', seg);
      await run('ffmpeg', args);
      await fsp.rm(overlay, { force: true });
      segmentFiles.push(seg);
    }
    if (!segmentFiles.length) throw new Error('No renderable image/video scenes were found.');
    const listFile = path.join(work, 'concat.txt');
    await fsp.writeFile(listFile, segmentFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const joined = path.join(work, 'joined.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', joined]);
    const outputName = `social-${project.id}-${Date.now()}.mp4`;
    const outputPath = path.join(DIRS.renders, outputName);
    const music = project.music_asset_id ? assetMap.get(project.music_asset_id) : null;
    if (music && (music.media_type === 'audio' || music.media_type === 'video')) {
      const musicPath = path.join(DIRS.assets, music.stored_name);
      const volume = Math.max(0, Math.min(1, Number(project.music_volume ?? 0.18)));
      await run('ffmpeg', ['-y', '-i', joined, '-stream_loop', '-1', '-i', musicPath, '-filter_complex', `[1:a]volume=${volume.toFixed(2)}[music]`, '-map', '0:v:0', '-map', '[music]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', outputPath]);
    } else {
      await fsp.copyFile(joined, outputPath);
    }
    await pool.query(`UPDATE oak_social_projects SET render_path=$1, updated_at=now() WHERE id=$2`, [outputName, project.id]);
    await audit('video_rendered', 'project', project.id, { output: outputName, scenes: segmentFiles.length, music_asset_id: project.music_asset_id || null });
    return outputName;
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function exportProject(project) {
  const outputName = `oak-social-${project.platform}-${project.id}-${Date.now()}.zip`;
  const outputPath = path.join(DIRS.exports, outputName);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    const caption = `${project.title || ''}\n\n${project.caption || ''}\n\n${(project.hashtags || []).join(' ')}`.trim();
    archive.append(caption, { name: 'caption.txt' });
    archive.append(JSON.stringify({
      platform: project.platform,
      format: project.format,
      language: project.language,
      aspect_ratio: project.aspect_ratio,
      scheduled_for: project.scheduled_for,
      scenes: project.scenes,
      template_style: project.template_style,
      subtitle_mode: project.subtitle_mode,
      cover_asset_id: project.cover_asset_id,
      music_asset_id: project.music_asset_id,
      music_volume: project.music_volume,
      platform_preset: project.platform_preset
    }, null, 2), { name: 'project.json' });
    if (project.render_path) {
      const file = path.join(DIRS.renders, path.basename(project.render_path));
      if (fs.existsSync(file)) archive.file(file, { name: path.basename(file) });
    }
    if (project.cover_path && project.cover_path !== project.render_path) {
      const file = path.join(DIRS.renders, path.basename(project.cover_path));
      if (fs.existsSync(file)) archive.file(file, { name: path.basename(file) });
    }
    archive.finalize();
  });
  await pool.query(`UPDATE oak_social_projects SET export_path=$1, updated_at=now() WHERE id=$2`, [outputName, project.id]);
  await audit('publish_package_created', 'project', project.id, { output: outputName });
  return outputName;
}

app.get('/health', asyncRoute(async (_req, res) => {
  let ollama = false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(t);
    ollama = r.ok;
  } catch {}
  res.json({ ok: true, service: 'oak-social-api', build: BUILD, model: OLLAMA_MODEL, ollama_reachable: ollama });
}));

app.get('/dashboard', asyncRoute(async (_req, res) => {
  const [assets, projects, scheduled, campaigns, recent] = await Promise.all([
    pool.query(`SELECT count(*)::int AS count FROM oak_social_assets WHERE is_active=true`),
    pool.query(`SELECT count(*)::int AS count FROM oak_social_projects`),
    pool.query(`SELECT count(*)::int AS count FROM oak_social_projects WHERE status='scheduled' AND scheduled_for > now()`),
    pool.query(`SELECT count(*)::int AS count FROM oak_social_campaigns`),
    pool.query(`SELECT * FROM oak_social_projects ORDER BY updated_at DESC LIMIT 8`)
  ]);
  res.json({
    asset_count: assets.rows[0].count,
    project_count: projects.rows[0].count,
    scheduled_count: scheduled.rows[0].count,
    campaign_count: campaigns.rows[0].count,
    recent_projects: recent.rows.map(serializeProject)
  });
}));

app.get('/brand', asyncRoute(async (_req, res) => {
  res.json((await pool.query('SELECT * FROM oak_social_brand WHERE id=1')).rows[0]);
}));

app.put('/brand', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const row = (await pool.query(`
    UPDATE oak_social_brand SET
      brand_name=$1, tone=$2, languages=$3, brand_rules=$4, default_cta=$5,
      primary_color=$6, accent_color=$7, text_color=$8, font_family=$9,
      default_template=$10, watermark_position=$11, default_subtitle_mode=$12,
      logo_asset_id=$13, updated_at=now()
    WHERE id=1 RETURNING *
  `, [
    body.brand_name || 'Oak Lounge', body.tone || '', parseTags(body.languages), body.brand_rules || '', body.default_cta || '',
    safeHex(body.primary_color, '#855d3b'), safeHex(body.accent_color, '#d9b382'), safeHex(body.text_color, '#ffffff'),
    body.font_family || 'Noto Sans CJK SC', body.default_template || 'classic', body.watermark_position || 'bottom-left',
    body.default_subtitle_mode || 'bilingual', body.logo_asset_id || null
  ])).rows[0];
  await audit('brand_updated', 'brand', '1', body);
  res.json(row);
}));

app.post('/assets/upload', upload.array('files', 30), asyncRoute(async (req, res) => {
  const tags = parseTags(req.body.tags);
  const notes = req.body.notes || '';
  const created = [];
  for (const file of req.files || []) {
    const id = randomUUID();
    const mediaType = mediaTypeFromMime(file.mimetype);
    const full = path.join(DIRS.assets, file.filename);
    let width = null, height = null, duration = null;
    if (mediaType === 'image') {
      try {
        const meta = await sharp(full).metadata();
        width = meta.width || null;
        height = meta.height || null;
      } catch {}
    } else if (mediaType === 'video' || mediaType === 'audio') {
      const meta = await probeMedia(full);
      width = meta.width; height = meta.height; duration = meta.duration;
    }
    const thumbnailName = await makeThumbnail(full, mediaType, file.filename);
    const row = (await pool.query(`
      INSERT INTO oak_social_assets(id,original_name,stored_name,thumbnail_name,mime_type,media_type,size_bytes,width,height,duration_seconds,tags,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [id, file.originalname, file.filename, thumbnailName, file.mimetype, mediaType, file.size, width, height, duration, tags, notes])).rows[0];
    created.push(serializeAsset(row));
  }
  await audit('assets_uploaded', 'asset_batch', null, { count: created.length, ids: created.map(x => x.id) });
  res.status(201).json({ assets: created });
}));

app.get('/assets', asyncRoute(async (req, res) => {
  const type = req.query.media_type ? String(req.query.media_type) : null;
  const q = String(req.query.q || '').trim();
  const values = [];
  const where = ['is_active=true'];
  if (type) { values.push(type); where.push(`media_type=$${values.length}`); }
  if (q) { values.push(`%${q}%`); where.push(`(original_name ILIKE $${values.length} OR notes ILIKE $${values.length} OR array_to_string(tags, ',') ILIKE $${values.length})`); }
  const rows = (await pool.query(`SELECT * FROM oak_social_assets WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 300`, values)).rows;
  res.json(rows.map(serializeAsset));
}));

app.patch('/assets/:id', asyncRoute(async (req, res) => {
  const tags = parseTags(req.body.tags);
  const notes = req.body.notes ?? '';
  const row = (await pool.query(`UPDATE oak_social_assets SET tags=$1, notes=$2 WHERE id=$3 RETURNING *`, [tags, notes, req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Asset not found' });
  await audit('asset_updated', 'asset', req.params.id, { tags, notes });
  res.json(serializeAsset(row));
}));

app.delete('/assets/:id', asyncRoute(async (req, res) => {
  const row = (await pool.query(`UPDATE oak_social_assets SET is_active=false WHERE id=$1 RETURNING *`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Asset not found' });
  await audit('asset_archived', 'asset', req.params.id, {});
  res.json({ ok: true });
}));

app.post('/ai/plan', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!String(body.brief || '').trim()) return res.status(400).json({ error: 'brief is required' });
  const proposal = await buildCampaignProposal({
    brief: String(body.brief),
    objective: String(body.objective || ''),
    platforms: Array.isArray(body.platforms) ? body.platforms : [],
    languages: Array.isArray(body.languages) ? body.languages : [],
    assetIds: Array.isArray(body.asset_ids) ? body.asset_ids : []
  });
  await audit('ai_campaign_planned', 'ai', null, { brief: body.brief, platforms: body.platforms, asset_count: body.asset_ids?.length || 0 });
  res.json({ proposal });
}));

app.post('/campaigns', asyncRoute(async (req, res) => {
  const body = req.body || {};
  if (!body.proposal || !Array.isArray(body.proposal.posts)) return res.status(400).json({ error: 'proposal.posts is required' });
  const result = await saveCampaignFromProposal({
    brief: String(body.brief || ''),
    objective: String(body.objective || ''),
    platforms: Array.isArray(body.platforms) ? body.platforms : [],
    languages: Array.isArray(body.languages) ? body.languages : [],
    proposal: body.proposal,
    source: body.source || 'manual'
  });
  res.status(201).json(result);
}));

app.get('/campaigns', asyncRoute(async (_req, res) => {
  const rows = (await pool.query(`SELECT * FROM oak_social_campaigns ORDER BY created_at DESC LIMIT 100`)).rows;
  res.json(rows);
}));

app.get('/projects', asyncRoute(async (_req, res) => {
  const rows = (await pool.query(`SELECT * FROM oak_social_projects ORDER BY COALESCE(scheduled_for, updated_at) DESC LIMIT 250`)).rows;
  res.json(rows.map(serializeProject));
}));

app.get('/projects/:id', asyncRoute(async (req, res) => {
  const row = (await pool.query(`SELECT * FROM oak_social_projects WHERE id=$1`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(serializeProject(row));
}));

app.put('/projects/:id', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const row = (await pool.query(`
    UPDATE oak_social_projects SET
      platform=$1, format=$2, title=$3, hook=$4, caption=$5, hashtags=$6,
      language=$7, aspect_ratio=$8, duration_seconds=$9, scenes=$10, status=$11,
      template_style=$12, subtitle_mode=$13, cover_asset_id=$14, music_asset_id=$15,
      music_volume=$16, platform_preset=$17, updated_at=now()
    WHERE id=$18 RETURNING *
  `, [
    body.platform || 'instagram', body.format || 'still', body.title || '', body.hook || '', body.caption || '',
    parseTags(body.hashtags), body.language || 'English', body.aspect_ratio || '4:5', Number(body.duration_seconds || 15),
    JSON.stringify(Array.isArray(body.scenes) ? body.scenes : []), body.status || 'draft',
    body.template_style || 'classic', body.subtitle_mode || 'bilingual', body.cover_asset_id || null, body.music_asset_id || null,
    Math.max(0, Math.min(1, Number(body.music_volume ?? 0.18))), body.platform_preset || '', req.params.id
  ])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  await audit('project_updated', 'project', req.params.id, { platform: row.platform, format: row.format });
  res.json(serializeProject(row));
}));

app.post('/projects/:id/render/still', asyncRoute(async (req, res) => {
  const row = (await pool.query(`SELECT * FROM oak_social_projects WHERE id=$1`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  const output = await renderStill(row);
  res.json({ ok: true, render_url: relativeUrl('renders', output), cover_url: relativeUrl('renders', output) });
}));

app.post('/projects/:id/render/video', asyncRoute(async (req, res) => {
  const row = (await pool.query(`SELECT * FROM oak_social_projects WHERE id=$1`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  const output = await renderVideo(row);
  res.json({ ok: true, render_url: relativeUrl('renders', output) });
}));

app.post('/projects/:id/export', asyncRoute(async (req, res) => {
  const row = (await pool.query(`SELECT * FROM oak_social_projects WHERE id=$1`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  const output = await exportProject(row);
  res.json({ ok: true, export_url: relativeUrl('exports', output) });
}));

app.post('/projects/:id/schedule', asyncRoute(async (req, res) => {
  const when = req.body?.scheduled_for ? new Date(req.body.scheduled_for) : null;
  if (!when || Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Valid scheduled_for is required' });
  const row = (await pool.query(`UPDATE oak_social_projects SET scheduled_for=$1,status='scheduled',updated_at=now() WHERE id=$2 RETURNING *`, [when.toISOString(), req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  await audit('project_scheduled', 'project', req.params.id, { scheduled_for: when.toISOString() });
  res.json(serializeProject(row));
}));

app.post('/projects/:id/mark-published', asyncRoute(async (req, res) => {
  const row = (await pool.query(`UPDATE oak_social_projects SET status='published',updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])).rows[0];
  if (!row) return res.status(404).json({ error: 'Project not found' });
  await audit('project_marked_published', 'project', req.params.id, {});
  res.json(serializeProject(row));
}));

app.get('/agent/settings', asyncRoute(async (_req, res) => {
  res.json((await pool.query('SELECT * FROM oak_social_agent_settings WHERE id=1')).rows[0]);
}));

app.put('/agent/settings', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const row = (await pool.query(`
    UPDATE oak_social_agent_settings SET
      enabled=$1, timezone=$2, weekday=$3, hour=$4, platforms=$5, goal=$6, updated_at=now()
    WHERE id=1 RETURNING *
  `, [Boolean(b.enabled), b.timezone || 'Asia/Shanghai', Number(b.weekday || 1), Number(b.hour ?? 9), Array.isArray(b.platforms) ? b.platforms : [], b.goal || ''])).rows[0];
  await audit('agent_settings_updated', 'agent', '1', row);
  res.json(row);
}));

async function runAgentDraft(reason = 'manual') {
  const settings = (await pool.query('SELECT * FROM oak_social_agent_settings WHERE id=1')).rows[0];
  const assets = (await pool.query(`SELECT id FROM oak_social_assets WHERE is_active=true ORDER BY created_at DESC LIMIT 20`)).rows;
  const brief = `${settings.goal}\nUse recent Oak Lounge media. Produce a multi-platform weekly draft. This is a draft for human approval, not an instruction to auto-publish.`;
  const proposal = await buildCampaignProposal({
    brief,
    objective: 'Maintain a consistent weekly Oak Lounge social presence and encourage visits.',
    platforms: settings.platforms || [],
    languages: ['English', 'Simplified Chinese'],
    assetIds: assets.map(a => a.id)
  });
  const saved = await saveCampaignFromProposal({
    brief,
    objective: 'Weekly social presence',
    platforms: settings.platforms || [],
    languages: ['English', 'Simplified Chinese'],
    proposal,
    source: 'weekly_agent'
  });
  await pool.query(`UPDATE oak_social_campaigns SET status='agent_draft' WHERE id=$1`, [saved.campaign_id]);
  await pool.query(`UPDATE oak_social_agent_settings SET last_run_at=now() WHERE id=1`);
  await audit('weekly_agent_draft_created', 'campaign', saved.campaign_id, { reason });
  return saved;
}

app.post('/agent/run-now', asyncRoute(async (_req, res) => {
  res.status(201).json(await runAgentDraft('manual_run_now'));
}));

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekdayMap = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return { weekday: weekdayMap[obj.weekday], hour: Number(obj.hour), dateKey: `${obj.year}-${obj.month}-${obj.day}` };
}

async function agentTick() {
  try {
    await pool.query(`UPDATE oak_social_projects SET status='ready_to_publish',updated_at=now() WHERE status='scheduled' AND scheduled_for <= now()`);
    const settings = (await pool.query('SELECT * FROM oak_social_agent_settings WHERE id=1')).rows[0];
    if (!settings?.enabled) return;
    const now = new Date();
    const z = zonedParts(now, settings.timezone || 'Asia/Shanghai');
    if (z.weekday !== Number(settings.weekday) || z.hour !== Number(settings.hour)) return;
    if (settings.last_run_at) {
      const last = zonedParts(new Date(settings.last_run_at), settings.timezone || 'Asia/Shanghai');
      if (last.dateKey === z.dateKey) return;
    }
    await runAgentDraft('scheduled_weekly_agent');
  } catch (err) {
    console.error('Social agent tick failed:', err.message);
  }
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Unexpected server error' });
});

await initDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Oak Social API listening on ${PORT} (${BUILD})`);
  setTimeout(agentTick, 5000);
  setInterval(agentTick, Math.max(60000, AGENT_TICK_MS));
});
