import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { decoderGrille } from '../../src/donnees/statiques'
import { indiceProche } from '../../src/calcul/grille'

interface GrilleBrute {
  lon0: number
  lat0: number
  pasLon: number
  pasLat: number
  nx: number
  ny: number
  dedans: string
}

const brut = JSON.parse(readFileSync('public/data/grille-8km.json', 'utf8')) as GrilleBrute
const grille = decoderGrille(brut)

const compterPoints = (): number => grille.dedans.reduce((a, b) => a + b, 0)

test('la grille de 8 km contient entre 8500 et 9800 points en France', () => {
  const n = compterPoints()
  expect(n).toBeGreaterThanOrEqual(8500)
  expect(n).toBeLessThanOrEqual(9800)
})

const VILLES: Record<string, [number, number]> = {
  Paris: [2.3522, 48.8566],
  Brest: [-4.486, 48.3905],
  Strasbourg: [7.7521, 48.5734],
  Ajaccio: [8.7369, 41.9192],
  Bastia: [9.4508, 42.7028],
}

for (const [nom, [lon, lat]] of Object.entries(VILLES)) {
  test(`${nom} est couverte par la grille de 8 km`, () => {
    const i = indiceProche(grille, lon, lat)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(grille.dedans[i]).toBe(1)
  })
}
