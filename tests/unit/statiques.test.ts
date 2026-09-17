import { expect, test } from 'vitest'
import { decoderGrille } from '../../src/donnees/statiques'

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
