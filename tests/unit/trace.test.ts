import { expect, test } from 'vitest'
import { creerMoteurTc } from '../../src/calcul/couches'
import { personnesTrajetCarte } from '../../src/calcul/trace'
import { INJOIGNABLE, type Horaires, type Ligne, type Station } from '../../src/donnees/horaires'
import type { Ami, Lieu } from '../../src/types'

const ligne = (m: number[], k: number[], g: number[], c: number[], p: number[]): Ligne => ({
  minutes: Uint16Array.from(m), km: Uint16Array.from(k),
  grandeLigne: Uint8Array.from(g), correspondances: Uint8Array.from(c), precedente: Uint16Array.from(p),
})

// A (Paris, proche des amis) -> B (Dijon, intermédiaire, à plus de 50 km des deux bouts) -> C (Lyon,
// proche de la ville testée). Ligne depuis A : 0 min vers elle-même, 20 min vers B, 50 min vers C
// (une correspondance à B).
const stations: Station[] = [
  { nom: 'Paris Gare de Lyon', lat: 48.85, lon: 2.35, desservie: true },
  { nom: 'Dijon-Ville', lat: 47.32, lon: 5.04, desservie: true },
  { nom: 'Lyon Part Dieu', lat: 45.75, lon: 4.85, desservie: true },
]
const ligneA = ligne([0, 20, 50], [0, 190, 400], [0, 0, 1], [0, 0, 1], [INJOIGNABLE, 0, 1])

function fauxHoraires(): Horaires {
  const chargees = new Map<number, Ligne>()
  return {
    stations,
    voisins: { gares: new Uint16Array(), hectometres: new Uint16Array() },
    lignes: async (indices) => {
      for (const i of indices) if (i === 0) chargees.set(0, ligneA)
    },
    ligne: (i) => chargees.get(i),
  }
}

const franck: Ami = { id: 'f', nom: 'Franck', adresse: '', lat: 48.86, lon: 2.34, transport: 'tc', navigo: false }
const mo: Ami = { id: 'm', nom: 'Mo', adresse: '', lat: 48.86, lon: 2.34, transport: 'tc', navigo: false }
const lea: Ami = { id: 'l', nom: 'Léa', adresse: '', lat: 45.8, lon: 4.9, transport: 'voiture', navigo: false }
const lyon: Lieu = { lat: 45.76, lon: 4.86, label: 'Lyon' }

test('sans cible, aucun trajet à dessiner', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  expect(personnesTrajetCarte([franck], 'tc', moteur, null)).toEqual([])
})

test('hors mode transports, pas de chemin ferroviaire', () => {
  const resultat = personnesTrajetCarte([franck], 'oiseau', null, lyon)
  expect(resultat).toHaveLength(1)
  expect(resultat[0]!.chemin).toBeNull()
  expect(resultat[0]!.directSansTrain).toBe(false)
})

test('mode transports : chemin de gares avec une correspondance', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const resultat = personnesTrajetCarte([franck], 'tc', moteur, lyon)
  expect(resultat).toHaveLength(1)
  const p = resultat[0]!
  expect(p.gareDepart).toBe(0)
  expect(p.gareArrivee).toBe(2)
  expect(p.chemin).not.toBeNull()
  expect(p.chemin!.map((g) => g.nom)).toEqual(['Paris Gare de Lyon', 'Dijon-Ville', 'Lyon Part Dieu'])
  expect(p.chemin!.length).toBeGreaterThan(2)
})

test('deux personnes au même point : un seul trajet dessiné, tous les noms', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck, mo])
  const resultat = personnesTrajetCarte([franck, mo], 'tc', moteur, lyon)
  expect(resultat).toHaveLength(1)
  expect(resultat[0]!.noms.sort()).toEqual(['Franck', 'Mo'])
})

test('deux personnes à des points différents : deux trajets', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck, lea])
  const resultat = personnesTrajetCarte([franck, lea], 'tc', moteur, lyon)
  expect(resultat).toHaveLength(2)
})
