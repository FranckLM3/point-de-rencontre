import { expect, test, vi } from 'vitest'
import { chargerGrille, decoderGrille } from '../../src/donnees/statiques'

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
