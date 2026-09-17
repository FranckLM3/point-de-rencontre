import { expect, test } from 'vitest'
import type { Ami } from '../../src/types'
import { etiquette, grouperParPosition, infobulleCentre, infobulleMarqueur, initiales } from '../../src/ui/marqueurs'

const ami = (id: string, nom: string, lat: number, lon: number, transport: Ami['transport'] = 'tc'): Ami => ({
  id, nom, adresse: 'x', lat, lon, transport, navigo: false,
})

test('initiales d’un ou plusieurs mots', () => {
  expect(initiales('Franck')).toBe('FR')
  expect(initiales('Jean Dupont')).toBe('JD')
  expect(initiales('jean pierre dupont')).toBe('JD')
  expect(initiales('  ')).toBe('?')
})

test('deux personnes à la même adresse donnent un seul point étiqueté 2', () => {
  const points = grouperParPosition([ami('a', 'Léa', 48.8555, 2.36041), ami('b', 'Tom', 48.855500001, 2.36041), ami('c', 'Zoé', 43.3, 5.4)])
  expect(points).toHaveLength(2)
  expect(etiquette(points[0]!)).toBe('2')
  expect(points[0]!.amis.map((a) => a.id)).toEqual(['a', 'b'])
  expect(etiquette(points[1]!)).toBe('ZO')
})

test('infobulle d’un point : noms échappés et moyens de transport', () => {
  const [p] = grouperParPosition([ami('a', '<b>Léa</b>', 1, 1), ami('b', 'Tom', 1, 1, 'voiture')])
  const html = infobulleMarqueur(p!)
  expect(html).not.toContain('<b>')
  expect(html).toContain('&#60;b&#62;Léa')
  expect(html).toContain('transports')
  expect(html).toContain('Tom (voiture)')
})

test('infobulle du centre selon le critère', () => {
  expect(infobulleCentre(310.4, 'pire')).toBe('Meilleur point, 310 km au pire')
  expect(infobulleCentre(220, 'moyenne')).toBe('Meilleur point, 220 km en moyenne')
})

test('infobulle du centre en minutes', () => {
  expect(infobulleCentre(194, 'pire', 'min')).toBe('Meilleur point, 3 h 14 au pire')
})
