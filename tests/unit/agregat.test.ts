import { expect, test } from 'vitest'
import { agreger, distancesOiseau, limiterAuMaximum, meilleurIndice } from '../../src/calcul/agregat'
import type { Grille } from '../../src/calcul/grille'

const a = Float32Array.from([1, 5, NaN])
const b = Float32Array.from([3, 1, 2])

test('moyenne par point', () => {
  expect(Array.from(agreger([a, b], 'moyenne'))).toEqual([2, 3, NaN])
})

test('pire trajet par point', () => {
  expect(Array.from(agreger([a, b], 'pire'))).toEqual([3, 5, NaN])
})

test('aucune couche : tout est NaN', () => {
  expect(Array.from(agreger([], 'pire', 2))).toEqual([NaN, NaN])
})

test('meilleurIndice ignore les NaN et rend -1 si tout est vide', () => {
  expect(meilleurIndice(Float32Array.from([NaN, 4, 2]))).toBe(2)
  expect(meilleurIndice(Float32Array.from([NaN]))).toBe(-1)
})

test('limiterAuMaximum sans maximum : la couche n’est pas modifiée', () => {
  const valeurs = Float32Array.from([1, 2, 3])
  expect(limiterAuMaximum(valeurs, valeurs, null)).toBe(valeurs)
})

test('limiterAuMaximum exclut un point où le pire dépasse le maximum, même si le critère affiché ne le dépasse pas', () => {
  // Point 1 : moyenne (critère affiché) à 2, mais pire à 5 > 4 → exclu malgré la moyenne basse.
  const moyennes = Float32Array.from([1, 2, 3])
  const pires = Float32Array.from([1, 5, 3])
  expect(Array.from(limiterAuMaximum(moyennes, pires, 4))).toEqual([1, NaN, 3])
})

test('distancesOiseau met NaN hors de France', () => {
  const g: Grille = { lon0: 2, lat0: 48, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: new Uint8Array([1, 0]) }
  const d = distancesOiseau(g, 48, 2)
  expect(d[0]).toBe(0)
  expect(Number.isNaN(d[1])).toBe(true)
})
