import { expect, test } from 'vitest'
import { creerMoteurTc, creerMoteurVoiture } from '../../src/calcul/couches'
import { personnesTrajetCarte } from '../../src/calcul/trace'
import type { Couche, ParametresPrix } from '../../src/calcul/voiture'
import type { Grille } from '../../src/calcul/grille'
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
  expect(personnesTrajetCarte([franck], 'tc', moteur, null, null)).toEqual([])
})

test('hors mode transports, pas de chemin ferroviaire', () => {
  const resultat = personnesTrajetCarte([franck], 'oiseau', null, null, lyon)
  expect(resultat).toHaveLength(1)
  expect(resultat[0]!.chemin).toBeNull()
  expect(resultat[0]!.directSansTrain).toBe(false)
  expect(resultat[0]!.enVoiture).toBe(false)
})

test('mode transports : chemin de gares avec une correspondance', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const resultat = personnesTrajetCarte([franck], 'tc', moteur, null, lyon)
  expect(resultat).toHaveLength(1)
  const p = resultat[0]!
  expect(p.gareDepart).toBe(0)
  expect(p.gareArrivee).toBe(2)
  expect(p.chemin).not.toBeNull()
  expect(p.chemin!.map((g) => g.nom)).toEqual(['Paris Gare de Lyon', 'Dijon-Ville', 'Lyon Part Dieu'])
  expect(p.chemin!.length).toBeGreaterThan(2)
  expect(p.enVoiture).toBe(false)
})

test('deux personnes au même point : un seul trajet dessiné, tous les noms', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck, mo])
  const resultat = personnesTrajetCarte([franck, mo], 'tc', moteur, null, lyon)
  expect(resultat).toHaveLength(1)
  expect(resultat[0]!.noms.sort()).toEqual(['Franck', 'Mo'])
})

test('deux personnes à des points différents : deux trajets', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck, lea])
  const resultat = personnesTrajetCarte([franck, lea], 'tc', moteur, null, lyon)
  expect(resultat).toHaveLength(2)
})

const grille8: Grille = { lon0: 0, lat0: 40, pasLon: 10, pasLat: 10, nx: 2, ny: 2, dedans: new Uint8Array([1, 1, 1, 1]) }
const parametres: ParametresPrix = { consommationL100: 10, prixLitre: 2, personnesParVoiture: 1 }
const coucheLea: Couche = { minutes: Uint16Array.from([60, 120, 180, 240]), km: Uint16Array.from([50, 100, 150, 200]) }

test('mode voiture : ligne droite pointillée, sans chemin ferroviaire', () => {
  const resultat = personnesTrajetCarte([lea], 'voiture', null, null, lyon)
  expect(resultat).toHaveLength(1)
  expect(resultat[0]!.chemin).toBeNull()
  expect(resultat[0]!.enVoiture).toBe(true)
})

test('mode mixte : voiture pour Léa si sa couche est prête, chemin ferroviaire pour Franck', async () => {
  const moteurTc = creerMoteurTc(fauxHoraires(), 1)
  await moteurTc.preparer([franck, lea])
  const moteurVoiture = creerMoteurVoiture(grille8, parametres, new Map([['l', coucheLea]]))
  const resultat = personnesTrajetCarte([franck, lea], 'mixte', moteurTc, moteurVoiture, lyon)
  const pourFranck = resultat.find((p) => p.noms.includes('Franck'))!
  const pourLea = resultat.find((p) => p.noms.includes('Léa'))!
  expect(pourFranck.enVoiture).toBe(false)
  expect(pourFranck.chemin).not.toBeNull()
  expect(pourLea.enVoiture).toBe(true)
  expect(pourLea.chemin).toBeNull()
})

test('mode mixte : repli sur le chemin ferroviaire tant que la couche voiture de Léa n’est pas prête', async () => {
  const moteurTc = creerMoteurTc(fauxHoraires(), 1)
  await moteurTc.preparer([franck, lea])
  const moteurVoitureVide = creerMoteurVoiture(grille8, parametres, new Map())
  const resultat = personnesTrajetCarte([lea], 'mixte', moteurTc, moteurVoitureVide, lyon)
  expect(resultat[0]!.enVoiture).toBe(false)
})
