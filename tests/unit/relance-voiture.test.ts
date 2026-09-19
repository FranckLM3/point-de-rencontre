import { expect, test } from 'vitest'
import { aRelancer } from '../../src/calcul/relance-voiture'
import type { Ami } from '../../src/types'

const ami = (id: string, transport: Ami['transport']): Ami => ({ id, nom: id, adresse: 'x', lat: 45, lon: 4, transport, navigo: false })

test('relance les Crocos en voiture sans couche, une seule fois', () => {
  const amis = [ami('a', 'voiture'), ami('b', 'voiture'), ami('c', 'tc')]
  const couches = new Set(['b'])
  const tentes = new Set<string>()
  expect(aRelancer(amis, couches, tentes)).toEqual(['a'])
  expect(aRelancer(amis, couches, tentes)).toEqual([])
})

test('rien à relancer quand tout est calculé', () => {
  expect(aRelancer([ami('a', 'voiture')], new Set(['a']), new Set())).toEqual([])
})
