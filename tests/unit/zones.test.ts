import { expect, test } from 'vitest'
import { COULEURS_TRANCHES, seuils, zones } from '../../src/calcul/zones'
import type { Grille } from '../../src/calcul/grille'

test('seuils par pas jusqu’au maximum inclus', () => {
  expect(seuils(100, 350)).toEqual([100, 200, 300, 350])
})

test('sans maximum, seuils jusqu’à la plus grande valeur, bornés au nombre de couleurs', () => {
  expect(seuils(100, null, 250)).toEqual([100, 200, 250])
  expect(seuils(100, null, 5000).length).toBe(COULEURS_TRANCHES.length)
})

test('plusGrande non fini traité comme 0', () => {
  expect(seuils(100, null, NaN)).toEqual([0])
})

test('zones rend une tranche par seuil, en lon/lat, de la plus large à la plus étroite', () => {
  const g: Grille = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 3, dedans: new Uint8Array(9).fill(1) }
  const v = Float32Array.from([9, 9, 9, 9, 1, 9, 9, 9, 9])
  const t = zones(g, v, [5, 10])
  expect(t.map((z) => z.seuil)).toEqual([10, 5])
  const anneau = t[1]!.coordonnees[0]![0]!
  for (const [lon, lat] of anneau) {
    expect(lon).toBeGreaterThanOrEqual(0)
    expect(lon).toBeLessThanOrEqual(2)
    expect(lat).toBeGreaterThanOrEqual(40)
    expect(lat).toBeLessThanOrEqual(42)
  }
})

test('la couleur suit le rang du seuil dans une liste croissante, indépendamment de l’ordre passé', () => {
  const g: Grille = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 3, dedans: new Uint8Array(9).fill(1) }
  const v = Float32Array.from([9, 9, 9, 9, 1, 9, 9, 9, 9])
  const t1 = zones(g, v, [5, 10])
  expect(t1.find((z) => z.seuil === 5)!.couleur).toBe(COULEURS_TRANCHES[0])
  expect(t1.find((z) => z.seuil === 10)!.couleur).toBe(COULEURS_TRANCHES[1])

  const t2 = zones(g, v, [10, 5])
  expect(t2.map((z) => z.seuil)).toEqual(t1.map((z) => z.seuil))
  expect(t2.map((z) => z.couleur)).toEqual(t1.map((z) => z.couleur))
})

test('palette des zones : dégradé de vert, du plus proche au plus loin', () => {
  expect(COULEURS_TRANCHES).toEqual(['#0e9150', '#22a65e', '#3fbb6f', '#5ecf82', '#82e096', '#a9edad', '#cdf5c9', '#eafbe6'])
})
