import { expect, test } from 'vitest'
import { INJOIGNABLE } from '../../src/donnees/horaires'
import type { Grille } from '../../src/calcul/grille'
import {
  CONSOMMATION_DEFAUT,
  PERSONNES_PAR_VOITURE_DEFAUT,
  coucheVoiture,
  indexPointsFrance,
  prixVoiture,
  valeurVoiture,
  type Couche,
  type ParametresPrix,
} from '../../src/calcul/voiture'

// Grille synthétique 2x2, tous les points en France ; l'ordre « compact » (points en
// France seulement) est donc identique à l'ordre de la grille complète.
const g8: Grille = { lon0: 0, lat0: 0, pasLon: 1, pasLat: 1, nx: 2, ny: 2, dedans: new Uint8Array([1, 1, 1, 1]) }
const index = indexPointsFrance(g8)
const couche: Couche = { minutes: new Uint16Array([60, 120, 180, 240]), km: new Uint16Array([10, 20, 30, 40]) }

test('indexPointsFrance donne l’indice compact, -1 hors de France', () => {
  const g: Grille = { lon0: 0, lat0: 0, pasLon: 1, pasLat: 1, nx: 2, ny: 2, dedans: new Uint8Array([1, 0, 1, 1]) }
  expect(Array.from(indexPointsFrance(g))).toEqual([0, -1, 1, 2])
})

test('valeurVoiture rend la valeur exacte sur un point de la grille', () => {
  expect(valeurVoiture(g8, index, couche, 0, 0)).toEqual({ minutes: 60, km: 10 })
})

test('valeurVoiture interpole bilinéairement au centre de 4 points', () => {
  const v = valeurVoiture(g8, index, couche, 0.5, 0.5)!
  expect(v.minutes).toBeCloseTo(150)
  expect(v.km).toBeCloseTo(25)
})

test('valeurVoiture ignore un voisin injoignable et renormalise les poids', () => {
  const c: Couche = { minutes: new Uint16Array([60, INJOIGNABLE, 180, 240]), km: new Uint16Array([10, 20, 30, 40]) }
  // (0.5, 0) : à mi-chemin entre les points 0 (0,0) et 1 (1,0), poids 0 pour la ligne du haut.
  const v = valeurVoiture(g8, index, c, 0.5, 0)!
  expect(v.minutes).toBeCloseTo(60)
  expect(v.km).toBeCloseTo(10)
})

test('valeurVoiture rend null si tous les voisins sont hors de France', () => {
  const g: Grille = { lon0: 0, lat0: 0, pasLon: 1, pasLat: 1, nx: 2, ny: 2, dedans: new Uint8Array([0, 0, 0, 0]) }
  expect(valeurVoiture(g, indexPointsFrance(g), couche, 0.5, 0.5)).toBeNull()
})

test('valeurVoiture rend null hors des limites de la grille', () => {
  expect(valeurVoiture(g8, index, couche, -5, -5)).toBeNull()
})

const parametres: ParametresPrix = { consommationL100: 10, prixLitre: 2, personnesParVoiture: 1 }

test('prixVoiture est nul à distance nulle', () => {
  expect(prixVoiture(0, parametres)).toBe(0)
})

test('prixVoiture : pas de péage en dessous de 80 km', () => {
  expect(prixVoiture(50, parametres)).toBeCloseTo(10)
})

test('prixVoiture : péage sur 70 % de la distance au-delà de 80 km, à 0,09 €/km', () => {
  // carburant : 100 km x 10 L/100 x 2 € = 20 € ; péage : (100 - 80) x 0.7 x 0.09 = 1.26 €.
  expect(prixVoiture(100, parametres)).toBeCloseTo(21.26)
})

test('prixVoiture divise par le nombre de personnes par voiture', () => {
  expect(prixVoiture(100, { ...parametres, personnesParVoiture: 2 })).toBeCloseTo(10.63)
})

test('les constantes par défaut correspondent à la décision du plan', () => {
  expect(CONSOMMATION_DEFAUT).toBe(6.5)
  expect(PERSONNES_PAR_VOITURE_DEFAUT).toBe(1)
})

test('coucheVoiture rend une grille 4 km pleine (NaN hors de France) en temps', () => {
  const g4: Grille = { lon0: 0, lat0: 0, pasLon: 1, pasLat: 1, nx: 2, ny: 2, dedans: new Uint8Array([1, 1, 0, 1]) }
  const sortie = coucheVoiture(g4, g8, index, couche, 'temps', parametres)
  expect(sortie.length).toBe(4)
  expect(sortie[0]).toBeCloseTo(60)
  expect(sortie[1]).toBeCloseTo(120)
  expect(Number.isNaN(sortie[2])).toBe(true)
  expect(sortie[3]).toBeCloseTo(240)
})

test('coucheVoiture rend le prix quand la grandeur est « prix »', () => {
  const g4: Grille = { lon0: 0, lat0: 0, pasLon: 1, pasLat: 1, nx: 1, ny: 1, dedans: new Uint8Array([1]) }
  const sortie = coucheVoiture(g4, g8, index, couche, 'prix', parametres)
  expect(sortie[0]).toBeCloseTo(prixVoiture(10, parametres))
})
