import { expect, test } from 'vitest'
import type { TrajetTc } from '../../src/calcul/tc'
import type { ParametresPrix } from '../../src/calcul/voiture'
import {
  descriptionTrajet, descriptionVoiture, duree, echapper, euros, km, libelleTransport, nomCourt, sousTitre, titreCourt, valeur,
} from '../../src/ui/format'

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

test('titreCourt : le nombre de Crocos, singulier ou pluriel', () => {
  expect(titreCourt(5)).toBe('Où se retrouver entre 5 Crocos')
  expect(titreCourt(1)).toBe('Où se retrouver entre 1 Croco')
})

test('sousTitre selon le mode, le critère et le maximum', () => {
  expect(sousTitre({ mode: 'tc', unite: 'min', critere: 'pire', max: 180 })).toBe(
    'En transports, au pire trajet le plus court, sans que personne ne dépasse 3 h',
  )
  expect(sousTitre({ mode: 'tc', unite: 'eur', critere: 'moyenne', max: null })).toBe(
    'En transports, au moins cher en moyenne',
  )
  expect(sousTitre({ mode: 'oiseau', unite: 'km', critere: 'pire', max: null })).toBe(
    'À vol d’oiseau, au pire trajet le plus court',
  )
})

test('sousTitre : le maximum porte toujours sur le pire trajet, même en critère moyenne', () => {
  expect(sousTitre({ mode: 'mixte', unite: 'min', critere: 'moyenne', max: 240 })).toBe(
    'Chacun avec son moyen, au plus court en moyenne, sans que personne ne dépasse 4 h',
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
  minutes: 0, euros: 0, depart: null, arrivee: null, departIndice: null, arriveeIndice: null, correspondances: 0,
  acces: { minutes: 0, mode: 'à pied' }, sortie: null, ...t,
})

test('descriptionTrajet : accès, gares, correspondances et sortie', () => {
  expect(descriptionTrajet(trajet({
    acces: { minutes: 22, mode: 'à pied' },
    depart: 'Marseille Saint-Charles',
    arrivee: 'Paris Gare de Lyon Hall 1 - 2',
    correspondances: 1,
    sortie: { minutes: 8, mode: 'transports' },
  }))).toBe('22 min à pied · Marseille Saint-Charles → Paris Gare de Lyon · 1 correspondance · 8 min en transports')
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
  expect(descriptionTrajet(trajet({ depart: 'A', arrivee: 'B', sortie: { minutes: 0, mode: 'transports' } })))
    .toBe('A → B')
})

test('descriptionTrajet : trajet direct sans train', () => {
  expect(descriptionTrajet(trajet({ acces: { minutes: 35, mode: 'voiture' } }))).toBe('35 min en voiture')
  expect(descriptionTrajet(trajet({ acces: { minutes: 20, mode: 'voiture' } }))).toBe('20 min en voiture')
  expect(descriptionTrajet(trajet({ acces: { minutes: 14, mode: 'à pied' } }))).toBe('14 min à pied')
})

test('sousTitre : au plus court en moyenne, à vol d’oiseau', () => {
  expect(sousTitre({ mode: 'oiseau', unite: 'km', critere: 'moyenne', max: null })).toBe(
    'À vol d’oiseau, au plus court en moyenne',
  )
})

test('descriptionVoiture : durée, distance et prix estimé, quelle que soit la grandeur affichée', () => {
  // carburant : 100 km x 10 L/100 x 2 € = 20 € ; péage : (100 - 80) x 0.7 x 0.09 = 1.26 € → 21 €.
  const parametres: ParametresPrix = { consommationL100: 10, prixLitre: 2, personnesParVoiture: 1 }
  expect(descriptionVoiture({ minutes: 192, km: 100 }, parametres)).toBe('3 h 12 de route · 100 km · ≈ 21 €')
})
