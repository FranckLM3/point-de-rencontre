import { expect, test, vi } from 'vitest'
import { chargerCarburant, chargerGrille, chargerGrille8km, decoderGrille } from '../../src/donnees/statiques'

const base64 = (octets: number[]): string => btoa(String.fromCharCode(...octets))

test('decoderGrille remet le masque base64 en octets', () => {
  const g = decoderGrille({ lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: base64([1, 0]) })
  expect(Array.from(g.dedans)).toEqual([1, 0])
  expect(g.nx).toBe(2)
})

test('decoderGrille refuse un masque de mauvaise taille', () => {
  const brut = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 1, dedans: base64([1]) }
  expect(() => decoderGrille(brut)).toThrow('grille')
})

test('chargerGrille lit la grille de 4 km', async () => {
  const brut = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: base64([1]) }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(brut)))
  vi.stubGlobal('fetch', f)
  try {
    await chargerGrille()
    expect(String(f.mock.calls[0]![0])).toMatch(/data\/grille-4km\.json$/)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('chargerGrille8km lit la grille de 8 km', async () => {
  const brut = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: base64([1]) }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(brut)))
  vi.stubGlobal('fetch', f)
  try {
    const g = await chargerGrille8km()
    expect(String(f.mock.calls[0]![0])).toMatch(/data\/grille-8km\.json$/)
    expect(Array.from(g.dedans)).toEqual([1])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('chargerCarburant lit le prix des carburants', async () => {
  const brut = { gazole: 2.405, sp95: 2.224, e10: 2.177, date: '2026-09-18' }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(brut)))
  vi.stubGlobal('fetch', f)
  try {
    const prix = await chargerCarburant()
    expect(String(f.mock.calls[0]![0])).toMatch(/data\/carburant\.json$/)
    expect(prix).toEqual(brut)
  } finally {
    vi.unstubAllGlobals()
  }
})
