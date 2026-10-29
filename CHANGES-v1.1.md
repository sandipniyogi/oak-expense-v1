# Oak Social Studio v1.1 — Brand Kit + Better Video Editor

## Added
- Reusable Brand Kit: logo selection, brand colors, font, watermark position, default template and subtitle mode.
- Platform presets for Instagram, Facebook, RED/Xiaohongshu, WeChat Channels and TikTok.
- Three render templates: Classic Gradient, Minimal Glass Box and Clean Editorial.
- Per-scene crop position, text position, transition, English subtitle and Chinese subtitle.
- Scene reordering controls.
- Selectable cover media and separate cover render.
- Optional uploaded audio track with adjustable music volume.
- Brand logo compositing in local still/video rendering.
- Platform/editor metadata included in publishing-package JSON.
- Additive database upgrade; existing campaigns/projects remain valid.

## Fixed
- Uses the ESM-safe PostgreSQL import (`import pg from 'pg'; const { Pool } = pg;`) so the Social API does not restart on Node 20.

## Not included yet
- Direct posting to social accounts.
- Full waveform/audio trimming.
- Multi-track timeline.
- Generative video models.
