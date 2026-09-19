import { expect, test } from 'vitest'
import { bout, etapeDirecte, etapeGare } from '../../src/calcul/etapes'
import type { Station } from '../../src/donnees/horaires'
import type { ReseauUrbain } from '../../src/donnees/urbain'
import type { Ami } from '../../src/types'

const paris: ReseauUrbain = {
  id: 'idf', nom: 'Île-de-France',
  stations: [
    { nom: 'Gare de Lyon', lat: 48.8443, lon: 2.3743 },
    { nom: 'Porte de Bagnolet', lat: 48.8645, lon: 2.4088 },
  ],
  // Porte de Bagnolet -> Gare de Lyon 16 min ; l'inverse 17 min.
  minutes: Uint8Array.from([0, 17, 16, 0]),
  gares: [{ gare: 0, station: 0 }],
}
const gareDeLyon: Station = { nom: 'Paris Gare de Lyon', lat: 48.8448, lon: 2.3735, desservie: true }
const vienne: Station = { nom: 'Vienne', lat: 45.5226, lon: 4.8712, desservie: true }
const eline: Ami = { id: 'e', nom: 'Eline', adresse: '', lat: 48.8660, lon: 2.4100, transport: 'tc', navigo: false }
const km = (x: number, v: number): number => ((x * 1.3) / v) * 60

test('hors réseau : à pied jusqu’à 1,5 km, en voiture au-delà', () => {
  const b = bout([paris], 45.53, 4.87)
  expect(b.reseau).toBeNull()
  expect(etapeGare(b, vienne, 1, eline, 'acces').segment.mode).toBe('à pied')
  const loin = bout([paris], 45.6, 4.87)
  const e = etapeGare(loin, vienne, 1, eline, 'acces')
  expect(e.segment.mode).toBe('voiture')
  expect(e.euros).toBe(0)
})

test('dans le réseau : métro jusqu’à la gare, correspondance de 5 min, ticket', () => {
  const b = bout([paris], eline.lat, eline.lon)
  const e = etapeGare(b, gareDeLyon, 0, eline, 'acces')
  expect(e.segment.mode).toBe('transports')
  // Marche vers Porte de Bagnolet (~0,2 km), 16 min de métro, 5 min de correspondance.
  expect(e.segment.minutes).toBeGreaterThan(21)
  expect(e.segment.minutes).toBeLessThan(25)
  expect(e.euros).toBe(2.5)
  expect(etapeGare(b, gareDeLyon, 0, { ...eline, navigo: true }, 'acces').euros).toBe(0)
  // Dans l'autre sens, la matrice donne 17 min.
  expect(etapeGare(b, gareDeLyon, 0, eline, 'sortie').segment.minutes).toBeCloseTo(e.segment.minutes + 1, 5)
})

test('qui se déplace en voiture prend sa voiture, même dans le réseau', () => {
  const b = bout([paris], eline.lat, eline.lon)
  const e = etapeGare(b, gareDeLyon, 0, { ...eline, transport: 'voiture' }, 'acces')
  expect(e.segment.mode).toBe('voiture')
})

test('trajet direct : par le réseau entre deux points du même réseau, en voiture jusqu’à 30 km ailleurs', () => {
  const chez = bout([paris], eline.lat, eline.lon)
  const gare = bout([paris], 48.8445, 2.3740)
  const e = etapeDirecte(chez, gare, eline)!
  expect(e.segment.mode).toBe('transports')
  expect(e.segment.minutes).toBeCloseTo(km(0.2, 4.5) + 16 + km(0.03, 4.5), 0)
  expect(etapeDirecte(bout([], 45.6, 4.87), bout([], 45.52, 4.87), eline)!.segment.mode).toBe('voiture')
  expect(etapeDirecte(bout([], 45.6, 4.87), bout([], 43.3, 5.38), eline)).toBeNull()
})
