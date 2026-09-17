import { expect, test, vi } from 'vitest'
import { choisirMesure, cleCouche, cleDepuis, creerChargeurTc, creerCouches, creerMoteurTc } from '../../src/calcul/couches'
import type { Grille } from '../../src/calcul/grille'
import { mesureOiseau } from '../../src/calcul/villes'
import type { Horaires, Ligne } from '../../src/donnees/horaires'
import type { Ami } from '../../src/types'

const ligne = (m: number[], k: number[], g: number[]): Ligne => ({
  minutes: Uint16Array.from(m), km: Uint16Array.from(k), grandeLigne: Uint8Array.from(g),
})

// Gare 0 à Marseille, gare 1 à Paris.
const toutes = new Map([
  [0, ligne([0, 194], [0, 750], [0, 1])],
  [1, ligne([196, 0], [750, 0], [1, 0])],
])

function fauxHoraires(): Horaires & { demandes: number[][] } {
  const chargees = new Map<number, Ligne>()
  const demandes: number[][] = []
  return {
    demandes,
    stations: [
      { nom: 'Marseille Saint-Charles', lat: 43.3027, lon: 5.3804, desservie: true },
      { nom: 'Paris Gare de Lyon', lat: 48.8449, lon: 2.3735, desservie: true },
    ],
    voisins: { gares: Uint16Array.from([1, 65535, 65535]), hectometres: Uint16Array.from([20, 0, 0]) },
    lignes: async (indices) => {
      demandes.push([...indices])
      for (const i of indices) chargees.set(i, toutes.get(i)!)
    },
    ligne: (i) => chargees.get(i),
  }
}

const marseille: Ami = { id: 'm', nom: 'Franck', adresse: 'x', lat: 43.2955, lon: 5.3925, transport: 'tc', navigo: false }
const paris: Ami = { id: 'p', nom: 'Léa', adresse: 'y', lat: 48.85, lon: 2.36, transport: 'voiture', navigo: false }
const grille: Grille = { lon0: 2.3522, lat0: 48.8566, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: new Uint8Array([1]) }

test('clés de cache : position et moyen de la personne, mode, grandeur et version des horaires', () => {
  expect(cleDepuis(marseille)).toBe('43.2955,5.3925,tc')
  expect(cleCouche({ mode: 'tc', grandeur: 'prix' }, marseille, 3)).toBe('tc|prix|43.2955,5.3925,tc|3')
  expect(cleCouche({ mode: 'tc', grandeur: 'temps' }, { ...marseille, transport: 'voiture' }, 3))
    .not.toBe(cleCouche({ mode: 'tc', grandeur: 'temps' }, marseille, 3))
})

test('préparer charge les lignes des gares proches de chaque personne', async () => {
  const h = fauxHoraires()
  const moteur = creerMoteurTc(h, 1)
  await moteur.preparer([marseille, paris])
  expect(h.demandes.flat().sort()).toEqual([0, 1])
  expect(moteur.depuis(marseille).minutes[1]).toBeGreaterThan(194)
})

test('depuis est mis en cache par position et moyen, pas avant le chargement des lignes', async () => {
  const h = fauxHoraires()
  const moteur = creerMoteurTc(h, 1)
  const avant = moteur.depuis(marseille)
  expect(Number.isFinite(avant.minutes[1])).toBe(false)
  await moteur.preparer([marseille])
  const apres = moteur.depuis(marseille)
  expect(Number.isFinite(apres.minutes[1])).toBe(true)
  expect(moteur.depuis({ ...marseille, id: 'autre' })).toBe(apres)
  expect(moteur.depuis({ ...marseille, transport: 'voiture' })).not.toBe(apres)
})

test('les gares proches d’un point sont calculées une seule fois', () => {
  const h = fauxHoraires()
  const moteur = creerMoteurTc(h, 1)
  const a = moteur.gares(48.85, 2.35)
  expect(a.map((g) => g.gare)).toEqual([1])
  expect(moteur.gares(48.85, 2.35)).toBe(a)
})

test('choisirMesure : vol d’oiseau hors transports ou sans horaires', () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  expect(choisirMesure({ mode: 'oiseau', grandeur: 'temps' }, moteur)).toBe(mesureOiseau)
  expect(choisirMesure({ mode: 'tc', grandeur: 'temps' }, null)).toBe(mesureOiseau)
})

test('choisirMesure en transports : temps ou prix, et précision des gares', async () => {
  const h = fauxHoraires()
  const moteur = creerMoteurTc(h, 1)
  await moteur.preparer([marseille])
  const temps = choisirMesure({ mode: 'tc', grandeur: 'temps' }, moteur)(marseille, 48.8566, 2.3522)!
  expect(temps.valeur).toBeGreaterThan(194)
  expect(temps.precision).toBe('Marseille Saint-Charles → Paris Gare de Lyon')
  const prix = choisirMesure({ mode: 'tc', grandeur: 'prix' }, moteur)(marseille, 48.8566, 2.3522)!
  expect(prix.valeur).toBeCloseTo(75 + 2)
  const pres = choisirMesure({ mode: 'tc', grandeur: 'temps' }, moteur)(marseille, 43.2965, 5.37)!
  expect(pres.precision).toBe('sans train')
  // Ajaccio : aucune gare à moins de 50 km.
  expect(choisirMesure({ mode: 'tc', grandeur: 'temps' }, moteur)(marseille, 41.93, 8.74)).toBeNull()
})

test('couches : vol d’oiseau ou transports, recalcul seulement si la clé change', async () => {
  const h = fauxHoraires()
  const moteur = creerMoteurTc(h, 1)
  await moteur.preparer([marseille])
  const couches = creerCouches(grille)
  const km = couches.obtenir(marseille, { mode: 'oiseau', grandeur: 'temps' }, null)
  expect(km[0]).toBeGreaterThan(600)
  const temps = couches.obtenir(marseille, { mode: 'tc', grandeur: 'temps' }, moteur)
  expect(temps[0]).toBeGreaterThan(194)
  expect(couches.obtenir(marseille, { mode: 'tc', grandeur: 'temps' }, moteur)).toBe(temps)
  expect(couches.obtenir(marseille, { mode: 'oiseau', grandeur: 'temps' }, null)).toBe(km)
  const prix = couches.obtenir(marseille, { mode: 'tc', grandeur: 'prix' }, moteur)
  expect(prix[0]).toBeCloseTo(77)
  const deplace = couches.obtenir({ ...marseille, lat: 43.3 }, { mode: 'tc', grandeur: 'temps' }, moteur)
  expect(deplace).not.toBe(temps)
})

test('couches : transports demandés sans horaires, erreur explicite', () => {
  const couches = creerCouches(grille)
  expect(() => couches.obtenir(marseille, { mode: 'tc', grandeur: 'temps' }, null)).toThrow()
})

test('préparer propage l’échec du chargement', async () => {
  const h = { ...fauxHoraires(), lignes: vi.fn(() => Promise.reject(new Error('Horaires des trains indisponibles pour le moment.'))) }
  const moteur = creerMoteurTc(h, 1)
  await expect(moteur.preparer([marseille])).rejects.toThrow('indisponibles')
})

test('chargeur : un seul chargement à la fois, puis moteur prêt', async () => {
  const creer = vi.fn(() => Promise.resolve(fauxHoraires()))
  const chargeur = creerChargeurTc(creer)
  expect(chargeur.pret()).toBeNull()
  const [a, b] = await Promise.all([chargeur.obtenir(), chargeur.obtenir()])
  expect(a).toBe(b)
  expect(creer).toHaveBeenCalledTimes(1)
  expect(chargeur.pret()).toBe(a)
  expect(await chargeur.obtenir()).toBe(a)
})

test('chargeur : après un échec, un nouvel essai relance le chargement', async () => {
  const creer = vi.fn()
    .mockImplementationOnce(() => Promise.reject(new Error('Horaires des trains indisponibles pour le moment.')))
    .mockImplementationOnce(() => Promise.resolve(fauxHoraires()))
  const chargeur = creerChargeurTc(creer)
  await expect(chargeur.obtenir()).rejects.toThrow('indisponibles')
  expect(chargeur.pret()).toBeNull()
  const moteur = await chargeur.obtenir()
  expect(moteur.horaires.stations).toHaveLength(2)
  expect(creer).toHaveBeenCalledTimes(2)
})
