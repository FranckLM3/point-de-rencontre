import { expect, test } from 'vitest'
import { haversineKm } from '../../src/calcul/geo'
import type { Grille } from '../../src/calcul/grille'
import { acces, cheminGares, coucheTc, depuisGares, garesProches, prixTrain, versPointTc } from '../../src/calcul/tc'
import { INJOIGNABLE, type Horaires, type Ligne, type Station } from '../../src/donnees/horaires'
import type { Ami } from '../../src/types'

const ligne = (m: number[], k: number[], g: number[], c: number[] = m.map(() => 0), p: number[] = m.map(() => INJOIGNABLE)): Ligne => ({
  minutes: Uint16Array.from(m), km: Uint16Array.from(k),
  grandeLigne: Uint8Array.from(g), correspondances: Uint8Array.from(c),
  precedente: Uint16Array.from(p),
})

// Gare 0 à Marseille, gare 1 à Paris ; 194 min, 750 km, grande ligne, 1 correspondance.
const lignes = new Map([
  [0, ligne([0, 194], [0, 750], [0, 1], [0, 1])],
  [1, ligne([196, 0], [750, 0], [1, 0], [1, 0])],
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

test('accès : à pied, en transports dans un réseau urbain, en voiture ailleurs', () => {
  expect(acces(1, 'tc', false)).toBeCloseTo((1 * 1.3 / 4.5) * 60)
  expect(acces(10, 'tc', true)).toBeCloseTo((10 * 1.3 / 20) * 60)
  expect(acces(10, 'tc', false)).toBeCloseTo((10 * 1.3 / 40) * 60)
  expect(acces(10, 'voiture', true)).toBeCloseTo((10 * 1.3 / 40) * 60)
})

test('prix du train', () => {
  expect(prixTrain(0, false)).toBe(0)
  expect(prixTrain(20, false)).toBe(5)
  expect(prixTrain(750, true)).toBeCloseTo(75)
  expect(prixTrain(100, false)).toBeCloseTo(12)
})

test('garesProches trie par distance', () => {
  const stations: Station[] = [
    { nom: 'loin', lat: 48.5, lon: 2.35, desservie: true },
    { nom: 'près', lat: 48.8, lon: 2.35, desservie: true },
  ]
  const g = garesProches(stations, 48.85, 2.35, 2)
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

test('garesProches : une gare routière et une vraie gare à moins de 500 m sont gardées toutes les deux (E7)', () => {
  const stations: Station[] = [
    { nom: 'Gare routière', lat: 45.0, lon: 5.0, desservie: true, train: false },
    { nom: 'Gare', lat: 45.001, lon: 5.0, desservie: true, train: true }, // ≈ 111 m
  ]
  const g = garesProches(stations, 45.0, 5.0, 2)
  expect(g.map((x) => x.gare)).toEqual([0, 1])
})

test('garesProches : deux gares du même statut à moins de 500 m comptent toujours pour une', () => {
  const stations: Station[] = [
    { nom: 'A', lat: 45.0, lon: 5.0, desservie: true, train: true },
    { nom: 'A bis', lat: 45.001, lon: 5.0, desservie: true, train: true },
  ]
  const g = garesProches(stations, 45.0, 5.0, 2)
  expect(g.map((x) => x.gare)).toEqual([0])
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
  expect(loin.departIndice).toBe(0)
  expect(loin.arriveeIndice).toBe(1)
  const pres = versPointTc(horaires, d, franck, 43.2965, 5.37)!
  expect(pres.depart).toBeNull()
  expect(pres.departIndice).toBeNull()
  expect(pres.arriveeIndice).toBeNull()
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

test('garesProches ignore les gares à plus de 50 km', () => {
  // Ajaccio : la gare desservie la plus proche est sur le continent.
  expect(garesProches(horaires.stations, 41.93, 8.74)).toEqual([])
  const g = garesProches(horaires.stations, 43.6, 5.38)
  expect(g.map((x) => x.gare)).toEqual([0])
})

test('depuisGares : personne à plus de 50 km de toute gare, aucune gare joignable', () => {
  const isole: Ami = { ...franck, lat: 41.93, lon: 8.74 }
  const d = depuisGares(horaires, isole)
  expect(d.proches).toEqual([])
  expect(Number.isFinite(d.minutes[1])).toBe(false)
  // Seul le trajet direct reste possible.
  expect(versPointTc(horaires, d, isole, 41.95, 8.75)!.depart).toBeNull()
  expect(versPointTc(horaires, d, isole, 48.8566, 2.3522)).toBeNull()
})

test('versPointTc : lieu à plus de 50 km de toute gare, injoignable', () => {
  const d = depuisGares(horaires, franck)
  expect(versPointTc(horaires, d, franck, 41.93, 8.74)).toBeNull()
})

test('coucheTc : gare voisine à plus de 50 km ignorée', () => {
  const grille: Grille = { lon0: 2.3522, lat0: 48.8566, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: new Uint8Array([1]) }
  const h: Horaires = {
    ...horaires,
    voisins: { gares: Uint16Array.from([1, 65535, 65535]), hectometres: Uint16Array.from([501, 0, 0]) },
  }
  const temps = coucheTc(grille, h, depuisGares(h, franck), franck, 'temps')
  expect(Number.isNaN(temps[0])).toBe(true)
})

test('versPointTc : étapes du trajet, accès, sortie et correspondances', () => {
  const d = depuisGares(horaires, franck)
  const t = versPointTc(horaires, d, franck, 48.8566, 2.3522)!
  // Environ 1,3 km jusqu'à Saint-Charles : à pied.
  expect(t.acces.mode).toBe('à pied')
  expect(t.acces.minutes).toBeGreaterThan(15)
  expect(t.acces.minutes).toBeLessThan(30)
  // Environ 2 km depuis la Gare de Lyon, dans Paris : en transports (métro, RER).
  expect(t.sortie!.mode).toBe('transports')
  expect(t.sortie!.minutes).toBeGreaterThan(0)
  expect(t.correspondances).toBe(1)
  expect(t.minutes).toBeCloseTo(t.acces.minutes + 194 + t.sortie!.minutes)
})

test('versPointTc : trajet direct, un seul segment et pas de sortie', () => {
  const d = depuisGares(horaires, franck)
  const t = versPointTc(horaires, d, franck, 43.2965, 5.37)!
  expect(t.depart).toBeNull()
  expect(t.sortie).toBeNull()
  expect(t.correspondances).toBe(0)
  // Marseille n'a pas encore son réseau urbain : le trajet se fait en voiture.
  expect(t.acces.mode).toBe('voiture')
  expect(t.acces.minutes).toBeCloseTo(t.minutes)
})

test('versPointTc : lieu sur la gare même, pas de sortie', () => {
  const d = depuisGares(horaires, franck)
  const t = versPointTc(horaires, d, franck, 48.8449, 2.3735)!
  expect(t.arrivee).toBe('Paris Gare de Lyon')
  expect(t.sortie).toBeNull()
})

test('versPointTc : une gare desservie seulement par autocar subit une pénalité de 10 min au classement', () => {
  // Deux gares d'arrivée à même temps de train (100 min) depuis Marseille, à 280 m l'une de
  // l'autre (comme Lyon-Part-Dieu Gare Routière et Lyon Part Dieu en pratique, sous les 500 m qui
  // les feraient sinon compter pour une seule gare, cf. E7) : une gare routière pile sur le lieu
  // visé (0 min de sortie), une vraie gare à 280 m (environ 4,8 min à pied). Sans pénalité, la
  // gare routière gagnerait (100 < 104,8) ; avec les 10 min de pénalité, la vraie gare l'emporte
  // (110 > 104,8) — mais le temps affiché reste le temps réel, sans pénalité.
  const stations: Station[] = [
    { nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3804, desservie: true, train: true },
    { nom: 'Gare routière', lat: 45.0, lon: 5.0, desservie: true, train: false },
    { nom: 'Vraie gare', lat: 45.0025, lon: 5.0, desservie: true, train: true },
  ]
  const trois = new Map([[0, ligne([0, 100, 100], [0, 50, 50], [0, 0, 0], [0, 0, 0])]])
  const h: Horaires = {
    stations,
    voisins: { gares: new Uint16Array(), hectometres: new Uint16Array() },
    lignes: async () => {},
    ligne: (i) => trois.get(i),
  }
  const d = depuisGares(h, franck)
  const t = versPointTc(h, d, franck, 45.0, 5.0)!
  expect(t.arrivee).toBe('Vraie gare')
  const sortieAttendue = acces(haversineKm(45.0025, 5.0, 45.0, 5.0), 'tc', false)
  expect(t.minutes).toBeCloseTo(d.minutes[2]! + sortieAttendue)
})

test('versPointTc : seule gare joignable, routière : gardée quand même, temps réel affiché', () => {
  const stations: Station[] = [
    { nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3804, desservie: true, train: true },
    { nom: 'Gare routière isolée', lat: 45.0, lon: 5.0, desservie: true, train: false },
  ]
  const deux = new Map([[0, ligne([0, 100], [0, 50], [0, 0], [0, 0])]])
  const h: Horaires = {
    stations,
    voisins: { gares: new Uint16Array(), hectometres: new Uint16Array() },
    lignes: async () => {},
    ligne: (i) => deux.get(i),
  }
  const d = depuisGares(h, franck)
  const t = versPointTc(h, d, franck, 45.0, 5.0)!
  expect(t.arrivee).toBe('Gare routière isolée')
  expect(t.minutes).toBeCloseTo(d.minutes[1]!)
})

test('garesProches : une gare de train et une gare routière à 280 m sont gardées toutes les deux, la gare de train en premier (E7, même fixture que _distincte en Python)', () => {
  const stations: Station[] = [
    { nom: 'Lyon Part Dieu', lat: 45.0, lon: 5.0, desservie: true, train: true },
    { nom: 'Lyon-Part-Dieu Gare Routière', lat: 45.0025, lon: 5.0, desservie: true, train: false },
  ]
  const g = garesProches(stations, 45.0, 5.0, 2)
  expect(g.map((x) => x.gare)).toEqual([0, 1])
})

test('coucheTc (grille) et versPointTc (point) restent cohérents pour la même gare la plus proche (E7)', () => {
  // Même situation que le bug corrigé (Lyon) : une gare de train et une gare routière voisines.
  // La grille doit lister exactement les mêmes gares voisines, dans le même ordre, que
  // garesProches recalculé point à point, sous peine d'écart entre zones/repaire et villes/lieux.
  const stations: Station[] = [
    { nom: 'Lyon Part Dieu', lat: 45.75, lon: 4.86, desservie: true, train: true },
    { nom: 'Lyon-Part-Dieu Gare Routière', lat: 45.7523, lon: 4.86, desservie: true, train: false },
  ]
  const lignesMap = new Map([
    [0, ligne([0, 5], [0, 0.3], [0, 0], [0, 0])],
    [1, ligne([4, 0], [0.3, 0], [0, 0], [0, 0])],
  ])
  const cible = { lat: stations[0]!.lat, lon: stations[0]!.lon }
  const proches = garesProches(stations, cible.lat, cible.lon)
  const h: Horaires = {
    stations,
    voisins: {
      gares: Uint16Array.from([...proches.map((p) => p.gare), ...Array(3 - proches.length).fill(65535)]),
      hectometres: Uint16Array.from([...proches.map((p) => Math.round(p.km * 10)), ...Array(3 - proches.length).fill(0)]),
    },
    lignes: async () => {},
    ligne: (i) => lignesMap.get(i),
  }
  const ami: Ami = { id: 'x', nom: 'X', adresse: '', lat: 45.7, lon: 4.86, transport: 'tc', navigo: false }
  const grille: Grille = { lon0: cible.lon, lat0: cible.lat, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: new Uint8Array([1]) }
  const d = depuisGares(h, ami)
  const valeurGrille = coucheTc(grille, h, d, ami, 'temps')[0]!
  const valeurPoint = versPointTc(h, d, ami, cible.lat, cible.lon)!.minutes
  expect(Math.abs(valeurGrille - valeurPoint)).toBeLessThanOrEqual(1)
})

test('cheminGares : train direct', () => {
  const l = ligne([0, 60], [0, 10], [0, 0], [0, 0], [INJOIGNABLE, 0])
  expect(cheminGares(l, 0, 1)).toEqual([0, 1])
})

test('cheminGares : une correspondance', () => {
  // Gare 2 atteinte depuis 1, elle-même atteinte depuis 0 (source).
  const l = ligne([0, 30, 60], [0, 5, 10], [0, 0, 0], [0, 0, 1], [INJOIGNABLE, 0, 1])
  expect(cheminGares(l, 0, 2)).toEqual([0, 1, 2])
})

test('cheminGares : même gare de départ et d’arrivée', () => {
  const l = ligne([0], [0], [0], [0], [INJOIGNABLE])
  expect(cheminGares(l, 0, 0)).toEqual([0])
})

test('cheminGares : s’arrête à une gare injoignable dans la chaîne (donnée incohérente)', () => {
  const l = ligne([0, 60, 90], [0, 10, 15], [0, 0, 0], [0, 0, 0], [INJOIGNABLE, 0, INJOIGNABLE])
  // La gare 2 pointe vers une précédente injoignable sans atteindre 0 : on s'arrête là.
  expect(cheminGares(l, 0, 2)).toEqual([2])
})

test('cheminGares : boucle sans fin bornée à 400 pas', () => {
  const n = 500
  const precedente = Array.from({ length: n }, (_, i) => (i === 0 ? INJOIGNABLE : i - 1))
  const l = ligne(
    Array(n).fill(0),
    Array(n).fill(0),
    Array(n).fill(0),
    Array(n).fill(0),
    precedente,
  )
  const chemin = cheminGares(l, 0, n - 1)
  expect(chemin.length).toBeLessThanOrEqual(401)
})

