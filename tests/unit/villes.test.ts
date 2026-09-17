import { expect, test } from 'vitest'
import { classerVilles } from '../../src/calcul/villes'
import type { Ville } from '../../src/types'

const v = (nom: string, lat: number, lon: number): Ville => ({ nom, dep: '00', lat, lon, population: 1 })

test('classe par critère, filtre au maximum', () => {
  const amis = [{ lat: 48, lon: 2 }, { lat: 48, lon: 4 }]
  const villes = [v('Loin', 48, 10), v('Milieu', 48, 3), v('Bord', 48, 2)]
  const r = classerVilles(villes, amis, 'pire', 200, 10)
  expect(r.map((x) => x.ville.nom)).toEqual(['Milieu', 'Bord'])
  expect(r[0]!.parAmi).toHaveLength(2)
  expect(r[0]!.total).toBeCloseTo(r[0]!.parAmi[0]! + r[0]!.parAmi[1]!)
})

test('sans ami, aucune ville', () => {
  expect(classerVilles([v('A', 48, 2)], [], 'moyenne', null, 10)).toEqual([])
})
