import { expect, test } from 'vitest'
import type { Ami } from '../../src/types'
import { grouperEcran, listeNoms, type PointEcran } from '../../src/ui/grappes'

const point = (id: string, x: number, y: number): PointEcran => ({ id, x, y })

test('grouperEcran : deux points proches fusionnent, un point lointain reste seul', () => {
  const r = grouperEcran([point('a', 0, 0), point('b', 5, 5), point('c', 500, 500)], 20)
  expect(r).toHaveLength(2)
  const grosse = r.find((g) => g.membres.length === 2)!
  expect(grosse.membres).toEqual(['a', 'b'])
  const seule = r.find((g) => g.membres.length === 1)!
  expect(seule.membres).toEqual(['c'])
})

test('grouperEcran : le centre d’une grappe est la moyenne des points regroupés', () => {
  const r = grouperEcran([point('a', 0, 0), point('b', 10, 0)], 20)
  expect(r).toHaveLength(1)
  expect(r[0]!.x).toBeCloseTo(5)
  expect(r[0]!.y).toBeCloseTo(0)
})

test('grouperEcran : rayon nul, aucun point ne fusionne sauf position strictement identique', () => {
  const r = grouperEcran([point('a', 0, 0), point('b', 1, 0)], 0)
  expect(r).toHaveLength(2)
})

test('grouperEcran : liste vide', () => {
  expect(grouperEcran([], 20)).toEqual([])
})

const ami = (id: string, nom: string): Ami => ({ id, nom, adresse: 'x', lat: 0, lon: 0, transport: 'tc', navigo: false })

test('listeNoms : jusqu’à 8 noms tels quels', () => {
  const amis = Array.from({ length: 8 }, (_, i) => ami(`${i}`, `P${i}`))
  expect(listeNoms(amis)).toBe('P0, P1, P2, P3, P4, P5, P6, P7')
})

test('listeNoms : au-delà de 8, les 8 premiers puis « et N autres »', () => {
  const amis = Array.from({ length: 12 }, (_, i) => ami(`${i}`, `P${i}`))
  expect(listeNoms(amis)).toBe('P0, P1, P2, P3, P4, P5, P6, P7 et 4 autres')
})

test('listeNoms : un seul nom', () => {
  expect(listeNoms([ami('1', 'Zoé')])).toBe('Zoé')
})
