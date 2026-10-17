// ============================================================
// FracTone — Hono エントリ (Cloudflare Pages Functions)
//  作曲 (中点変位法) / 分析 はサーバーレス API として実行
// ============================================================
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { compose } from './lib/composer'
import { analyze } from './lib/analysis'
import type { ComposeRequest, Note } from './lib/types'
import { estimateKey } from './lib/theory'

const app = new Hono()
app.use('/api/*', cors())

const sanitizeNotes = (arr: unknown): Note[] =>
  (Array.isArray(arr) ? arr : [])
    .slice(0, 2000)
    .map((n: any, i) => ({
      id: String(n?.id ?? `n${i}`),
      midiNoteNumber: Math.max(0, Math.min(127, Math.round(Number(n?.midiNoteNumber) || 60))),
      startTime: Math.max(0, Number(n?.startTime) || 0),
      duration: Math.max(0.02, Math.min(30, Number(n?.duration) || 0.25)),
      velocity: n?.velocity != null ? Math.max(0, Math.min(1, Number(n.velocity))) : 0.8,
      source: n?.source === 'ai' ? 'ai' : 'user',
      tag: n?.tag,
    }))

app.get('/api/health', (c) => c.json({ ok: true, name: 'FracTone', engine: 'midpoint-displacement' }))

/** 作曲: mode=continue でユーザー入力の続きを生成 / mode=new で新規生成 */
app.post('/api/compose', async (c) => {
  try {
    const body = (await c.req.json()) as ComposeRequest
    if (!body?.params) return c.json({ error: 'params is required' }, 400)
    const p = body.params
    const params = {
      ...p,
      bars: Math.max(2, Math.min(32, Math.round(p.bars))),
      range: Math.max(5, Math.min(36, p.range)),
      displacement: Math.max(0, Math.min(1, p.displacement)),
      depth: Math.max(1, Math.min(7, Math.round(p.depth))),
      roughness: Math.max(0.2, Math.min(0.95, p.roughness)),
      bpm: Math.max(40, Math.min(220, p.bpm)),
      key: ((Math.round(p.key) % 12) + 12) % 12,
    }
    const result = compose({ mode: body.mode === 'new' ? 'new' : 'continue', sequence: sanitizeNotes(body.sequence), params }, 'server')
    const all = body.mode === 'new' ? result.notes : [...sanitizeNotes(body.sequence), ...result.notes]
    const analysis = analyze(all, params.key, params.scale, params.bpm, params.timeSig)
    return c.json({ result, analysis })
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 500)
  }
})

app.post('/api/analyze', async (c) => {
  const body = await c.req.json()
  const notes = sanitizeNotes(body?.sequence)
  const key = estimateKey(notes.map((n) => n.midiNoteNumber), notes.map((n) => n.duration))
  return c.json({ analysis: analyze(notes, body?.key ?? 0, body?.scale ?? 'major', body?.bpm ?? 110, body?.timeSig ?? '4/4'), estimatedKey: key })
})

const shell = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#0a0812" />
<title>FracTone — フラクタル作曲 & DTM学習</title>
<meta name="description" content="中点変位法でメロディの続きを作曲するブラウザDTMシーケンサー" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎹</text></svg>" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=M+PLUS+Rounded+1c:wght@400;500;700&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/static/app.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="/static/app.js"></script>
</body>
</html>`

app.get('/', (c) => c.html(shell))

export default app
