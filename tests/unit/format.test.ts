import { expect, test } from 'vitest'
import type { TrajetTc } from '../../src/calcul/tc'
import { descriptionTrajet, duree, echapper, euros, km, libelleTransport, nomCourt, titre, valeur } from '../../src/ui/format'

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

test('nomCourt retire le hall en fin de nom de gare', () => {
  expect(nomCourt('Paris Gare de Lyon Hall 1 - 2')).toBe('Paris Gare de Lyon')
  expect(nomCourt('Paris Gare de Lyon Hall 2')).toBe('Paris Gare de Lyon')
  expect(nomCourt('Marseille Saint-Charles')).toBe('Marseille Saint-Charles')
  // Une gare routière reste une gare routière.
  expect(nomCourt('Lyon-Part-Dieu Gare Routière')).toBe('Lyon-Part-Dieu Gare Routière')
})

const trajet = (t: Partial<TrajetTc>): TrajetTc => ({
  minutes: 0, euros: 0, depart: null, arrivee: null, correspondances: 0,
  acces: { minutes: 0, mode: 'à pied' }, sortie: null, ...t,
})

test('descriptionTrajet : accès, gares, correspondances et sortie', () => {
  expect(descriptionTrajet(trajet({
    acces: { minutes: 22, mode: 'à pied' },
    depart: 'Marseille Saint-Charles',
    arrivee: 'Paris Gare de Lyon Hall 1 - 2',
    correspondances: 1,
    sortie: { minutes: 8, mode: 'bus' },
  }))).toBe('22 min à pied · Marseille Saint-Charles → Paris Gare de Lyon · 1 correspondance · 8 min de bus')
})

test('descriptionTrajet : pluriel des correspondances', () => {
  expect(descriptionTrajet(trajet({
    acces: { minutes: 5, mode: 'à pied' }, depart: 'A', arrivee: 'B', correspondances: 2,
  }))).toBe('5 min à pied · A → B · 2 correspondances')
})

test('descriptionTrajet : sans correspondance, rien n’est écrit', () => {
  expect(descriptionTrajet(trajet({
    acces: { minutes: 12, mode: 'voiture' }, depart: 'A', arrivee: 'B',
  }))).toBe('12 min de voiture · A → B')
})

test('descriptionTrajet : accès nul non affiché', () => {
  expect(descriptionTrajet(trajet({ depart: 'A', arrivee: 'B', sortie: { minutes: 0, mode: 'bus' } })))
    .toBe('A → B')
})

test('descriptionTrajet : trajet direct sans train', () => {
  expect(descriptionTrajet(trajet({ acces: { minutes: 35, mode: 'bus' } }))).toBe('35 min en bus')
  expect(descriptionTrajet(trajet({ acces: { minutes: 20, mode: 'voiture' } }))).toBe('20 min en voiture')
  expect(descriptionTrajet(trajet({ acces: { minutes: 14, mode: 'à pied' } }))).toBe('14 min à pied')
})
