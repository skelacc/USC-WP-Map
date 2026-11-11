import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Decision } from './merges'
import { SyncNotSetUp, issueBody, mergeDecisionLists, parseIssueBody, sameDecisions, syncNow } from './sync'
import { EMPTY_USERDATA } from './userdata'

const d = (pair: string, decision: 'confirm' | 'reject', at: string): Decision => ({ pair, decision, decidedAt: at })

describe('Sync-Logik', () => {
  it('vereinigt je Paar, neuere Entscheidung gewinnt', () => {
    const handy = [d('a~1', 'confirm', '2026-11-09T10:00:00Z'), d('b~2', 'confirm', '2026-11-09T10:00:00Z')]
    const pc = [d('a~1', 'reject', '2026-11-09T12:00:00Z'), d('c~3', 'confirm', '2026-11-08T10:00:00Z')]
    const m = mergeDecisionLists(handy, pc)
    expect(m).toHaveLength(3)
    expect(m.find((x) => x.pair === 'a~1')!.decision).toBe('reject')
    expect(sameDecisions(m, mergeDecisionLists(pc, handy))).toBe(true)
  })
  it('schreibt und liest den JSON-Block im Issue', () => {
    const list = [d('a~1', 'confirm', '2026-11-09T10:00:00Z')]
    expect(parseIssueBody(issueBody(list)).decisions).toEqual(list)
    expect(parseIssueBody('kein Block').decisions).toEqual([])
    // altes Format: reine Liste
    expect(parseIssueBody('```json\n' + JSON.stringify(list) + '\n```').decisions).toEqual(list)
    expect(() => parseIssueBody('```json\n{kaputt\n```')).toThrow()
  })
})

describe('syncNow gegen GitHub (gemockt)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('liest ohne Token, schreibt nicht', async () => {
    const remote = [d('x~1', 'confirm', '2026-11-09T09:00:00Z')]
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init
      if (url.includes('/issues?')) return new Response(JSON.stringify([{ number: 7, title: 'Studio Map: Zuordnungen (Sync)', body: '', html_url: 'u' }]))
      return new Response(JSON.stringify({ number: 7, title: '', body: issueBody(remote), html_url: 'u' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await syncNow({ repo: 'o/r', issue: null, token: null }, { decisions: [d('y~2', 'reject', '2026-11-09T10:00:00Z')], userdata: EMPTY_USERDATA })
    expect(r.issue).toBe(7)
    expect(r.merged.decisions.map((x) => x.pair).sort()).toEqual(['x~1', 'y~2'])
    expect(r.pushed).toBe(false)
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('schreibt mit Token die vereinigte Liste zurück', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ number: 7, title: '', body: issueBody([]), html_url: 'u' }))
    })
    const r = await syncNow({ repo: 'o/r', issue: 7, token: 't' }, { decisions: [d('y~2', 'confirm', '2026-11-09T10:00:00Z')], userdata: EMPTY_USERDATA })
    expect(r.pushed).toBe(true)
    const patch = calls.find((c) => c.init?.method === 'PATCH')!
    expect(JSON.parse(String(patch.init!.body)).body).toContain('y~2')
    expect((patch.init!.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })

  it('ohne Issue und ohne Token: „nicht eingerichtet“ statt Fehler', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([])))
    await expect(syncNow({ repo: 'o/r', issue: null, token: null }, { decisions: [], userdata: EMPTY_USERDATA })).rejects.toBeInstanceOf(SyncNotSetUp)
  })
})
