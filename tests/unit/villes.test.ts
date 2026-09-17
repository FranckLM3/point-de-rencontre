import { expect, test } from 'vitest'
import { haversineKm } from '../../src/calcul/geo'
import { classerVilles, type Mesure, mesureOiseau } from '../../src/calcul/villes'
import type { Ami, Ville } from '../../src/types'

const v = (nom: string, lat: number, lon: number): Ville => ({ nom, dep: '00', lat, lon, population: 1 })
const ami = (id: string, lat: number, lon: number): Ami => ({ id, nom: id, adresse: '', lat, lon, transport: 'tc', navigo: false })

test('classe par critère, filtre au maximum', () => {
  const amis = [ami('a', 48, 2), ami('b', 48, 4)]
  const villes = [v('Loin', 48, 10), v('Milieu', 48, 3), v('Bord', 48, 2)]
  const r = classerVilles(villes, amis, mesureOiseau, 'pire', 200, 10)
  expect(r.map((x) => x.ville.nom)).toEqual(['Milieu', 'Bord'])
  expect(r[0]!.parAmi).toHaveLength(2)
  expect(r[0]!.total).toBeCloseTo(r[0]!.parAmi[0]!.valeur + r[0]!.parAmi[1]!.valeur)
})

test('la mesure vol d’oiseau donne la distance exacte au centre de la ville', () => {
  const r = classerVilles([v('Lyon', 45.76, 4.83)], [ami('a', 48.85, 2.35)], mesureOiseau, 'moyenne', null, 10)
  expect(r[0]!.parAmi[0]!.valeur).toBeCloseTo(haversineKm(48.85, 2.35, 45.76, 4.83))
  expect(r[0]!.pire).toBeCloseTo(r[0]!.moyenne)
})

test('une ville injoignable pour une personne est écartée, la précision est gardée', () => {
  const mesure: Mesure = (a, lat) => (a.id === 'b' && lat > 47 ? null : { valeur: 10, precision: 'sans train' })
  const r = classerVilles([v('Nord', 48, 2), v('Sud', 44, 2)], [ami('a', 48, 2), ami('b', 45, 2)], mesure, 'moyenne', null, 10)
  expect(r.map((x) => x.ville.nom)).toEqual(['Sud'])
  expect(r[0]!.parAmi[1]!.precision).toBe('sans train')
})

test('sans ami, aucune ville', () => {
  expect(classerVilles([v('A', 48, 2)], [], mesureOiseau, 'moyenne', null, 10)).toEqual([])
})
