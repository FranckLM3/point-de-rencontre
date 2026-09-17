import { expect, test } from 'vitest'
import { coordonnees, indiceProche, type Grille } from '../../src/calcul/grille'

const g: Grille = {
  lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 2,
  dedans: new Uint8Array([1, 1, 0, 1, 1, 1]),
}

test('coordonnees lit ligne puis colonne depuis le sud-ouest', () => {
  expect(coordonnees(g, 0)).toEqual([0, 40])
  expect(coordonnees(g, 5)).toEqual([2, 41])
})

test('indiceProche arrondit au point de grille le plus proche', () => {
  expect(indiceProche(g, 1.4, 40.6)).toBe(4)
})

test('indiceProche rend -1 hors de la grille', () => {
  expect(indiceProche(g, 10, 40)).toBe(-1)
})
