import { expect, test } from 'vitest'
import { compterParFoyer } from '../../src/calcul/foyers'
import type { Ami } from '../../src/types'

const ami = (id: string, nom: string, lat: number, lon: number, transport: Ami['transport'] = 'tc'): Ami => ({
  id, nom, adresse: '', lat, lon, transport, navigo: false,
})

test('même adresse et même moyen : un seul trajet, les noms réunis', () => {
  const amis = [ami('f', 'Franck', 43.3, 5.39), ami('m', 'Mo', 43.3, 5.39), ami('y', 'Yanis', 45.76, 4.84)]
  const r = compterParFoyer(amis)
  expect(r.map((a) => a.nom)).toEqual(['Franck et Mo', 'Yanis'])
  expect(r[0]!.id).toBe('f')
})

test('même adresse mais moyens différents : deux trajets', () => {
  const r = compterParFoyer([ami('f', 'Franck', 43.3, 5.39), ami('m', 'Mo', 43.3, 5.39, 'voiture')])
  expect(r.map((a) => a.nom)).toEqual(['Franck', 'Mo'])
})

test('trois personnes à la même adresse : « Franck, Mo et Zoé »', () => {
  const r = compterParFoyer([ami('f', 'Franck', 43.3, 5.39), ami('m', 'Mo', 43.3, 5.39), ami('z', 'Zoé', 43.3, 5.39)])
  expect(r.map((a) => a.nom)).toEqual(['Franck, Mo et Zoé'])
})

test('liste vide', () => {
  expect(compterParFoyer([])).toEqual([])
})
