import { expect, test } from 'vitest'
import { duree, echapper, euros, km, libelleTransport, titre, valeur } from '../../src/ui/format'

test('km sans espace des milliers, arrondi', () => {
  expect(km(1234.4)).toBe('1234 km')
  expect(km(8.26)).toBe('8 km')
})

test('durées lisibles', () => {
  expect(duree(45)).toBe('45 min')
  expect(duree(60)).toBe('1 h')
  expect(duree(194)).toBe('3 h 14')
  expect(duree(125.6)).toBe('2 h 06')
})

test('prix arrondis à l’euro, sans espace des milliers', () => {
  expect(euros(61.4)).toBe('61 €')
  expect(euros(1234)).toBe('1234 €')
})

test('valeur selon l’unité', () => {
  expect(valeur(120, 'km')).toBe('120 km')
  expect(valeur(120, 'min')).toBe('2 h')
  expect(valeur(40, 'eur')).toBe('40 €')
})

test('titre selon le mode, la grandeur et le maximum', () => {
  expect(titre({ nombre: 3, mode: 'tc', unite: 'min', critere: 'pire', max: 180 })).toBe(
    'Où se retrouver à 3, en transports, sans dépasser 3 h',
  )
  expect(titre({ nombre: 3, mode: 'tc', unite: 'eur', critere: 'moyenne', max: null })).toBe(
    'Où se retrouver à 3, en transports, au moins cher en moyenne',
  )
  expect(titre({ nombre: 2, mode: 'oiseau', unite: 'km', critere: 'pire', max: null })).toBe(
    'Où se retrouver à 2, à vol d’oiseau, au pire trajet le plus court',
  )
})

test('libellés de transport', () => {
  expect(libelleTransport('voiture')).toBe('voiture')
  expect(libelleTransport('tc')).toBe('transports')
})

test('echapper neutralise le HTML', () => {
  expect(echapper('<b>"x"</b>')).toBe('&#60;b&#62;&#34;x&#34;&#60;/b&#62;')
  expect(echapper(`l'&`)).toBe('l&#39;&#38;')
})
