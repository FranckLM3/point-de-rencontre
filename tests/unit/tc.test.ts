import { expect, test } from 'vitest'
import type { Grille } from '../../src/calcul/grille'
import { acces, coucheTc, depuisGares, garesProches, prixTrain, versPointTc } from '../../src/calcul/tc'
import type { Horaires, Ligne, Station } from '../../src/donnees/horaires'
import type { Ami } from '../../src/types'

const ligne = (m: number[], k: number[], g: number[]): Ligne => ({
  minutes: Uint16Array.from(m), km: Uint16Array.from(k), grandeLigne: Uint8Array.from(g),
})

// Gare 0 à Marseille, gare 1 à Paris ; 194 min, 750 km, grande ligne.
const lignes = new Map([
  [0, ligne([0, 194], [0, 750], [0, 1])],
  [1, ligne([196, 0], [750, 0], [1, 0])],
])
const horaires: Horaires = {
  stations: [
    { nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3804, desservie: true },
    { nom: 'Paris Gare de Lyon', lat: 48.8449, lon: 2.3735, desservie: true },
  ],
  voisins: { gares: new Uint16Array(), hectometres: new Uint16Array() },
  lignes: async () => {},
  ligne: (i) => lignes.get(i),
}
const franck: Ami = { id: 'f', nom: 'Franck', adresse: 'x', lat: 43.2955, lon: 5.3925, transport: 'tc', navigo: false }

test('accès : à pied, en bus, en voiture', () => {
  expect(acces(1, 'tc')).toBeCloseTo((1 * 1.3 / 4.5) * 60)
  expect(acces(10, 'tc')).toBeCloseTo((10 * 1.3 / 20) * 60)
  expect(acces(10, 'voiture')).toBeCloseTo((10 * 1.3 / 40) * 60)
})

test('prix du train', () => {
  expect(prixTrain(0, false)).toBe(0)
  expect(prixTrain(20, false)).toBe(5)
  expect(prixTrain(750, true)).toBeCloseTo(75)
  expect(prixTrain(100, false)).toBeCloseTo(12)
})

test('garesProches trie par distance', () => {
  const g = garesProches(horaires.stations, 48.85, 2.35, 2)
  expect(g.map((x) => x.gare)).toEqual([1, 0])
})

test('garesProches ignore les gares non desservies et celles à moins de 500 m d’une gare retenue', () => {
  const s = (nom: string, lat: number, desservie = true): Station => ({ nom, lat, lon: 2, desservie })
  // Écarts en latitude : 0,001° ≈ 111 m.
  const stations = [s('fermée', 48.0, false), s('A', 48.001), s('A bis', 48.004), s('B', 48.01), s('C', 48.02), s('D', 48.03)]
  const g = garesProches(stations, 48.0, 2)
  expect(g.map((x) => stations[x.gare]!.nom)).toEqual(['A', 'B', 'C'])
  expect(g[0]!.km).toBeCloseTo(0.111, 2)
})

test('depuisGares : temps et prix vers chaque gare, gare de départ retenue', () => {
  const d = depuisGares(horaires, franck)
  expect(d.minutes[1]).toBeGreaterThan(194)
  // Accès à pied d'environ 1,3 km depuis le boulevard Chave : un peu plus de 20 min.
  expect(d.minutes[1]).toBeLessThan(194 + 30)
  expect(d.euros[1]).toBeCloseTo(75)
  expect(d.depart[1]).toBe(0)
})

test('versPointTc : trajet complet avec gares et direct si proche', () => {
  const d = depuisGares(horaires, franck)
  const loin = versPointTc(horaires, d, franck, 48.8566, 2.3522)!
  expect(loin.minutes).toBeGreaterThan(194)
  expect(loin.depart).toBe('Marseille Saint-Charles')
  expect(loin.arrivee).toBe('Paris Gare de Lyon')
  const pres = versPointTc(horaires, d, franck, 43.2965, 5.37)!
  expect(pres.depart).toBeNull()
})

test('versPointTc : lieu lointain sans ligne chargée, injoignable', () => {
  const vide: Horaires = { ...horaires, ligne: () => undefined }
  const d = depuisGares(vide, franck)
  expect(versPointTc(vide, d, franck, 48.8566, 2.3522)).toBeNull()
})

test('coucheTc : NaN hors de France, valeurs ailleurs', () => {
  const grille: Grille = { lon0: 2.3522, lat0: 48.8566, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: new Uint8Array([1, 0]) }
  const h: Horaires = {
    ...horaires,
    voisins: {
      gares: Uint16Array.from([1, 65535, 65535, 65535, 65535, 65535]),
      hectometres: Uint16Array.from([20, 0, 0, 0, 0, 0]),
    },
  }
  const d = depuisGares(h, franck)
  const temps = coucheTc(grille, h, d, franck, 'temps')
  expect(temps[0]).toBeGreaterThan(194)
  expect(Number.isNaN(temps[1])).toBe(true)
  const prix = coucheTc(grille, h, d, franck, 'prix')
  expect(prix[0]).toBeCloseTo(75 + 2)
})
