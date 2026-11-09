/**
 * Lokale Import-API – nur im Vite-Dev-Server (`npm run dev`) aktiv.
 *
 * Es gibt bewusst kein eigenständiges Backend: Dieses Plugin startet die
 * Python-Importskripte (scripts/studiomap) als Kindprozess und reicht deren
 * JSON-Zeilen als Live-Status an die Oberfläche weiter. In einem statischen
 * Build (`npm run build`) existieren diese Endpunkte nicht; die Oberfläche
 * zeigt dann die passenden Kommandozeilenbefehle an.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const ROOT = path.resolve(__dirname, '..')
const SCRIPTS = path.join(ROOT, 'scripts')
const STAGING_REPORT = path.join(ROOT, 'data', 'staging', 'report.json')
const MANUAL_IMPORT = path.join(ROOT, 'data', 'manual', 'import')
const PYTHON = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
const VALID_SOURCES = new Set(['usc', 'wellpass', 'manual'])

let running: ChildProcess | null = null

function readBody(req: IncomingMessage, limit = 5_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Anfrage zu groß'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** Startet `python -m studiomap <args>` und streamt stdout als NDJSON. */
function runStreaming(args: string[], req: IncomingMessage, res: ServerResponse) {
  if (running) return json(res, 409, { type: 'error', message: 'Es läuft bereits ein Import.' })
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')

  const child = spawn(PYTHON, ['-m', 'studiomap', ...args], { cwd: SCRIPTS, env: { ...process.env, PYTHONUNBUFFERED: '1' } })
  running = child
  let stderr = ''
  let finished = false

  child.stdout.on('data', (c: Buffer) => res.write(c))
  child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
  child.on('error', (err) => {
    res.write(JSON.stringify({ type: 'error', message: `Python konnte nicht gestartet werden (${PYTHON}): ${err.message}` }) + '\n')
  })
  child.on('close', (code) => {
    finished = true
    running = null
    if (code !== 0 && stderr.trim()) {
      res.write(JSON.stringify({ type: 'error', message: `Prozess beendet mit Code ${code}`, detail: stderr.slice(-4000) }) + '\n')
    }
    res.write(JSON.stringify({ type: 'exit', code }) + '\n')
    res.end()
  })
  // Abbruch durch den Client (AbortController) → Prozess beenden
  res.on('close', () => {
    if (!finished && child.exitCode === null) child.kill('SIGTERM')
  })
  void req
}

function runCollect(args: string[]): Promise<{ code: number | null; lines: unknown[]; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ['-m', 'studiomap', ...args], { cwd: SCRIPTS })
    let out = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => (out += c.toString()))
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('error', (e) => resolve({ code: -1, lines: [{ type: 'error', message: e.message }], stderr }))
    child.on('close', (code) => {
      const lines = out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return { type: 'log', message: l }
          }
        })
      resolve({ code, lines, stderr })
    })
  })
}

export function importApi(): Plugin {
  return {
    name: 'studio-import-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        try {
          if (req.method === 'GET' && url.pathname === '/api/status') {
            const staging = fs.existsSync(STAGING_REPORT) ? JSON.parse(fs.readFileSync(STAGING_REPORT, 'utf8')) : null
            return json(res, 200, { available: true, running: !!running, staging })
          }
          if (req.method === 'POST' && url.pathname === '/api/import') {
            const body = JSON.parse((await readBody(req)) || '{}')
            const sources: string[] = Array.isArray(body.sources) ? body.sources.filter((s: string) => VALID_SOURCES.has(s)) : []
            if (!sources.length) return json(res, 400, { type: 'error', message: 'Keine gültige Quelle gewählt.' })
            const args = ['fetch', '--sources', sources.join(',')]
            if (body.geocode) args.push('--geocode')
            return runStreaming(args, req, res)
          }
          if (req.method === 'POST' && (url.pathname === '/api/import/apply' || url.pathname === '/api/import/discard')) {
            if (running) return json(res, 409, { message: 'Es läuft noch ein Import.' })
            const body = JSON.parse((await readBody(req)) || '{}')
            const args = url.pathname.endsWith('apply') ? ['apply', ...(body.force ? ['--force'] : [])] : ['discard']
            const r = await runCollect(args)
            return json(res, r.code === 0 ? 200 : 422, r)
          }
          if (req.method === 'POST' && url.pathname === '/api/decide') {
            if (running) return json(res, 409, { message: 'Es läuft noch ein Import.' })
            const body = JSON.parse((await readBody(req)) || '{}')
            if (typeof body.pair !== 'string' || !['confirm', 'reject', 'reset'].includes(body.decision)) {
              return json(res, 400, { message: 'Ungültige Entscheidung.' })
            }
            const args = ['decide', body.pair, body.decision]
            if (body.fields && typeof body.fields === 'object') args.push('--fields', JSON.stringify(body.fields))
            if (Array.isArray(body.keys) && body.keys.every((k: unknown) => typeof k === 'string')) args.push('--keys', JSON.stringify(body.keys))
            const r = await runCollect(args)
            return json(res, r.code === 0 ? 200 : 422, r)
          }
          if (req.method === 'POST' && url.pathname === '/api/upload') {
            const body = JSON.parse(await readBody(req))
            const name = String(body.filename ?? '')
              .replace(/[^\w.\-äöüÄÖÜß]/g, '_')
              .replace(/^[_.]+/, '')
            if (!/\.(csv|json)$/i.test(name)) return json(res, 400, { message: 'Nur .csv- oder .json-Dateien.' })
            fs.mkdirSync(MANUAL_IMPORT, { recursive: true })
            // erst in einem versteckten Ordner prüfen, erst danach in den Importordner legen
            const tmpDir = path.join(MANUAL_IMPORT, `.upload-${Date.now()}`)
            fs.mkdirSync(tmpDir)
            const tmp = path.join(tmpDir, name)
            fs.writeFileSync(tmp, String(body.content ?? ''), 'utf8')
            const r = await runCollect(['validate', tmp])
            if (r.code === 0) fs.renameSync(tmp, path.join(MANUAL_IMPORT, name))
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (r.code !== 0) return json(res, 422, r)
            return json(res, 200, { ...r, savedAs: `data/manual/import/${name}` })
          }
          return json(res, 404, { message: 'Unbekannter Endpunkt' })
        } catch (e) {
          return json(res, 500, { message: e instanceof Error ? e.message : String(e) })
        }
      })
    },
  }
}
