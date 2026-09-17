import { expect, test } from 'vitest'
import { echapper, km, libelleTransport, titre } from '../../src/ui/format'

test('km sans espace des milliers, arrondi', () => {
  expect(km(1234.4)).toBe('1234 km')
  expect(km(8.26)).toBe('8 km')
})

test('titre selon critère et maximum', () => {
  expect(titre(12, 'pire', 300)).toBe('Où se retrouver à 12, à vol d’oiseau, sans dépasser 300 km')
  expect(titre(1, 'moyenne', null)).toBe('Où se retrouver à 1, à vol d’oiseau, au plus court en moyenne')
  expect(titre(3, 'pire', null)).toBe('Où se retrouver à 3, à vol d’oiseau, au pire trajet le plus court')
})

test('libellés de transport', () => {
  expect(libelleTransport('voiture')).toBe('voiture')
  expect(libelleTransport('tc')).toBe('transports')
})

test('echapper neutralise le HTML', () => {
  expect(echapper('<b>"x"</b>')).toBe('&#60;b&#62;&#34;x&#34;&#60;/b&#62;')
  expect(echapper(`l'&`)).toBe('l&#39;&#38;')
})
