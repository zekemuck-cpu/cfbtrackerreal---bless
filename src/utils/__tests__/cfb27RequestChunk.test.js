import { describe, it, expect } from 'vitest'
import { chunkByBytes, chunkPairByBytes, MAX_REQUEST_BYTES } from '../cfb27RequestChunk'

// A Vercel serverless function rejects a request body over ~4.5 MB with a bare
// 413 before the handler runs. A full CFB 27 import is ~16,000 players, which
// is several times that — so the un-chunked form failed for every user, every
// time ("Bulk player import failed (413)"), writing nothing.

const player = (pid, pad = 0) => ({ pid, name: `Player ${pid}`, position: 'QB', filler: 'x'.repeat(pad) })
const bytesOf = (arr) => JSON.stringify(arr).length

describe('chunkByBytes', () => {
  it('keeps every batch under the cap for a full-size league import', () => {
    // ~16k players at ~600 bytes each ≈ 10 MB — the real failing case.
    const players = Array.from({ length: 16257 }, (_, i) => player(i, 500))
    expect(bytesOf(players)).toBeGreaterThan(MAX_REQUEST_BYTES)

    const groups = chunkByBytes(players)
    expect(groups.length).toBeGreaterThan(1)
    for (const g of groups) expect(bytesOf(g)).toBeLessThanOrEqual(MAX_REQUEST_BYTES)
  })

  it('loses nothing and preserves order', () => {
    const players = Array.from({ length: 5000 }, (_, i) => player(i, 800))
    const flat = chunkByBytes(players).flat()
    expect(flat).toHaveLength(players.length)
    expect(flat.map(p => p.pid)).toEqual(players.map(p => p.pid))
  })

  it('sends a small roster as a single request', () => {
    const players = Array.from({ length: 85 }, (_, i) => player(i))
    expect(chunkByBytes(players)).toHaveLength(1)
  })

  it('sizes batches by BYTES, not count — heavy records batch smaller', () => {
    // The reason count-based chunking is wrong: same N, very different payload.
    const light = chunkByBytes(Array.from({ length: 4000 }, (_, i) => player(i, 10)))
    const heavy = chunkByBytes(Array.from({ length: 4000 }, (_, i) => player(i, 5000)))
    expect(heavy.length).toBeGreaterThan(light.length)
  })

  it('returns [] for empty or missing input rather than one empty request', () => {
    expect(chunkByBytes([])).toEqual([])
    expect(chunkByBytes(null)).toEqual([])
    expect(chunkByBytes(undefined)).toEqual([])
  })

  it('still emits a single oversized record instead of dropping it', () => {
    // Can't split one record further. Passing it through yields a clear 413 for
    // that record; silently discarding it would lose a player with no error.
    const groups = chunkByBytes([player(1, MAX_REQUEST_BYTES + 1000)])
    expect(groups).toHaveLength(1)
    expect(groups[0][0].pid).toBe(1)
  })

  it('does not choke on an unserializable record', () => {
    const circular = { pid: 9 }
    circular.self = circular
    expect(() => chunkByBytes([player(1), circular, player(2)])).not.toThrow()
  })
})

describe('chunkPairByBytes', () => {
  it('keeps creates and patches in separate requests, each under the cap', () => {
    const creates = Array.from({ length: 6000 }, (_, i) => player(i, 600))
    const patches = Array.from({ length: 6000 }, (_, i) => ({ pid: i, patch: { overall: 80, note: 'y'.repeat(600) } }))

    const batches = chunkPairByBytes(creates, patches)
    expect(batches.length).toBeGreaterThan(1)
    for (const b of batches) {
      expect(bytesOf(b.creates) + bytesOf(b.patches)).toBeLessThanOrEqual(MAX_REQUEST_BYTES * 2)
      // A batch carries one kind or the other, never a full chunk of both —
      // combining two full chunks could exceed the cap again.
      expect(b.creates.length === 0 || b.patches.length === 0).toBe(true)
    }
    expect(batches.reduce((n, b) => n + b.creates.length, 0)).toBe(creates.length)
    expect(batches.reduce((n, b) => n + b.patches.length, 0)).toBe(patches.length)
  })

  it('handles one side being empty', () => {
    const creates = Array.from({ length: 50 }, (_, i) => player(i))
    const batches = chunkPairByBytes(creates, [])
    expect(batches).toHaveLength(1)
    expect(batches[0].creates).toHaveLength(50)
    expect(batches[0].patches).toEqual([])
  })

  it('returns no batches when there is nothing to send', () => {
    expect(chunkPairByBytes([], [])).toEqual([])
  })
})
