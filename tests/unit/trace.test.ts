import { expect, test } from 'vitest'
import { creerMoteurTc, creerMoteurVoiture } from '../../src/calcul/couches'
import { personnesTrajetCarte, routesADemander } from '../../src/calcul/trace'
import type { Couche, ParametresPrix } from '../../src/calcul/voiture'
import type { Grille } from '../../src/calcul/grille'
import { INJOIGNABLE, type Horaires, type Ligne, type Station } from '../../src/donnees/horaires'
import type { Rails } from '../../src/donnees/rails'
import type { Itineraires } from '../../src/donnees/voiture'
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
/** À 7 km de la gare de Lyon, hors de tout réseau urbain (ces horaires n'en ont pas) : fin en voiture. */
const vaulx: Lieu = { lat: 45.79, lon: 4.92, label: 'Vaulx' }

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

test('sans rails, le tracé suit exactement les gares (repli en ligne droite)', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, lyon)[0]!
  expect(p.trace).toEqual(p.chemin!.map((g) => [g.lat, g.lon]))
})

test('avec des rails, le tracé passe par les points intermédiaires du segment connu', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const rails: Rails = {
    segment: (de, vers) => (de === 0 && vers === 1 ? [[48.85, 2.35], [48.0, 3.5], [47.32, 5.04]] : null),
  }
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, lyon, rails)[0]!
  expect(p.trace).not.toBeNull()
  // Point intermédiaire du segment 0 -> 1 (Paris -> Dijon), ses extrémités restant celles des gares.
  expect(p.trace).toContainEqual([48.0, 3.5])
  expect(p.trace![0]).toEqual([stations[0]!.lat, stations[0]!.lon])
  // Segment 1 -> 2 (Dijon -> Lyon) inconnu : repli en ligne droite jusqu'à la gare d'arrivée.
  expect(p.trace!.at(-1)).toEqual([stations[2]!.lat, stations[2]!.lon])
})

test('avec des rails, un segment inconnu retombe sur une ligne droite entre les deux gares', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const rails: Rails = { segment: () => null }
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, lyon, rails)[0]!
  expect(p.trace).toEqual(p.chemin!.map((g) => [g.lat, g.lon]))
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
  expect(resultat[0]!.traceVoiture).toBeNull()
})

test('mode voiture : sans itineraires, pas de tracé de route (ligne droite en attendant)', () => {
  const resultat = personnesTrajetCarte([lea], 'voiture', null, null, lyon, null, null)
  expect(resultat[0]!.traceVoiture).toBeNull()
})

test('mode voiture : itinéraire en cache, son tracé remplace la ligne droite', () => {
  const trace: [number, number][] = [[45.8, 4.9], [45.77, 4.87], [45.76, 4.86]]
  const itineraires: Itineraires = {
    regarder: (depart, arrivee) => (depart.lat === lea.lat && arrivee.lat === lyon.lat ? { coordonnees: trace, minutes: 12, km: 8 } : null),
    demander: () => {},
  }
  const resultat = personnesTrajetCarte([lea], 'voiture', null, null, lyon, null, itineraires)
  expect(resultat[0]!.traceVoiture).toEqual(trace)
})

test('mode voiture : itinéraire pas encore en cache, traceVoiture reste null', () => {
  const itineraires: Itineraires = { regarder: () => null, demander: () => {} }
  const resultat = personnesTrajetCarte([lea], 'voiture', null, null, lyon, null, itineraires)
  expect(resultat[0]!.traceVoiture).toBeNull()
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

test('mode mixte : itinéraire en cache pour Léa (couche voiture prête)', async () => {
  const moteurTc = creerMoteurTc(fauxHoraires(), 1)
  await moteurTc.preparer([franck, lea])
  const moteurVoiture = creerMoteurVoiture(grille8, parametres, new Map([['l', coucheLea]]))
  const trace: [number, number][] = [[45.8, 4.9], [45.76, 4.86]]
  const itineraires: Itineraires = { regarder: () => ({ coordonnees: trace, minutes: 10, km: 6 }), demander: () => {} }
  const resultat = personnesTrajetCarte([lea], 'mixte', moteurTc, moteurVoiture, lyon, null, itineraires)
  expect(resultat[0]!.enVoiture).toBe(true)
  expect(resultat[0]!.traceVoiture).toEqual(trace)
})

test('mode mixte : repli sur le chemin ferroviaire tant que la couche voiture de Léa n’est pas prête', async () => {
  const moteurTc = creerMoteurTc(fauxHoraires(), 1)
  await moteurTc.preparer([franck, lea])
  const moteurVoitureVide = creerMoteurVoiture(grille8, parametres, new Map())
  const resultat = personnesTrajetCarte([lea], 'mixte', moteurTc, moteurVoitureVide, lyon)
  expect(resultat[0]!.enVoiture).toBe(false)
})

test('mode transports : la sortie vers le lieu suit la route quand elle est connue', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const routeAcces: [number, number][] = [[48.86, 2.34], [48.855, 2.345], [48.85, 2.35]]
  const routeSortie: [number, number][] = [[45.75, 4.85], [45.755, 4.855], [45.76, 4.86]]
  const demandes: string[] = []
  const itineraires: Itineraires = {
    regarder: (d, a) => {
      if (d.lat === franck.lat && a.lat === stations[0]!.lat) return { coordonnees: routeAcces, minutes: 3, km: 1 }
      if (d.lat === stations[2]!.lat && a.lat === vaulx.lat) return { coordonnees: routeSortie, minutes: 2, km: 1 }
      return null
    },
    demander: (d, a) => { demandes.push(`${d.lat}->${a.lat}`) },
  }
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, vaulx, null, itineraires)[0]!
  // Franck est à 1,3 km de sa gare : il y va à pied, pas de route ; la fin (7 km) se fait en voiture.
  expect(p.accesEnVoiture).toBe(false)
  expect(p.traceAcces).toBeNull()
  expect(p.sortieEnVoiture).toBe(true)
  expect(p.traceSortie).toEqual(routeSortie)
})

test('mode transports : sans route connue, accès et sortie restent null (pointillés droits)', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, lyon, null, { regarder: () => null, demander: () => {} })[0]!
  expect(p.traceAcces).toBeNull()
  expect(p.traceSortie).toBeNull()
})

test('une étape à pied (ou en métro) ne suit pas la route : aucune demande', async () => {
  const moteur = creerMoteurTc(fauxHoraires(), 1)
  await moteur.preparer([franck])
  const itineraires: Itineraires = { regarder: () => ({ coordonnees: [[0, 0], [1, 1]], minutes: 1, km: 1 }), demander: () => {} }
  const p = personnesTrajetCarte([franck], 'tc', moteur, null, lyon, null, itineraires)[0]!
  expect(p.traceAcces).toBeNull()
  expect(p.traceSortie).toBeNull()
  expect(routesADemander([p], lyon)).toEqual([])
})

test('routesADemander : étapes en voiture encore absentes du cache', () => {
  const p = {
    noms: ['Léa'], lat: 45.8, lon: 4.9, chemin: [{ lat: 45.75, lon: 4.85, nom: 'A' }, { lat: 43.3, lon: 5.38, nom: 'B' }],
    trace: null, gareDepart: 0, gareArrivee: 1, directSansTrain: false, enVoiture: false, traceVoiture: null,
    traceAcces: null, traceSortie: null, accesEnVoiture: true, sortieEnVoiture: true,
  }
  const cible: Lieu = { lat: 43.29, lon: 5.4, label: 'Marseille' }
  expect(routesADemander([p], cible)).toEqual([
    { depart: { lat: 45.8, lon: 4.9 }, arrivee: { lat: 45.75, lon: 4.85 } },
    { depart: { lat: 43.3, lon: 5.38 }, arrivee: { lat: 43.29, lon: 5.4 } },
  ])
  expect(routesADemander([{ ...p, accesEnVoiture: false }], cible)).toHaveLength(1)
})
