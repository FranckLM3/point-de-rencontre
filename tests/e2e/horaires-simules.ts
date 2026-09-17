/// <reference types="node" />
import { readFileSync } from 'node:fs'
import type { Page, Route } from '@playwright/test'
import { haversineKm } from '../../src/calcul/geo'
import type { Station } from '../../src/donnees/horaires'

/** Deux gares seulement : celles des deux personnes du parcours (Paris et Lyon). */
export const GARES: Station[] = [
  { nom: 'Paris Gare de Lyon Hall 1 - 2', lat: 48.8449, lon: 2.3735, desservie: true },
  { nom: 'Lyon-Part-Dieu', lat: 45.7602, lon: 4.8596, desservie: true },
]

const MINUTES = 120
const KM = 465
/** Bit 0 : une grande ligne est empruntée ; bits 1 à 4 : aucune correspondance. */
const DRAPEAUX = 0b0000_0001
const OCTETS_PAR_GARE = 5
const NB_VOISINS = 3
const INJOIGNABLE = 65535
const HECTOMETRES_MAX = 65535
/** Assez pour voir le message de chargement, assez court pour ne pas ralentir la suite. */
const DELAI_MS = 250

interface GrilleBrute {
  lon0: number
  lat0: number
  pasLon: number
  pasLat: number
  nx: number
  ny: number
  dedans: string
}

function grille(): GrilleBrute {
  return JSON.parse(readFileSync('public/data/grille-4km.json', 'utf8')) as GrilleBrute
}

/** `lignes/<i>.bin` : 5 octets par gare, la gare elle-même à zéro. */
function ligne(source: number): Buffer {
  const octets = Buffer.alloc(GARES.length * OCTETS_PAR_GARE)
  for (let j = 0; j < GARES.length; j++) {
    const decalage = j * OCTETS_PAR_GARE
    octets.writeUInt16LE(j === source ? 0 : MINUTES, decalage)
    octets.writeUInt16LE(j === source ? 0 : KM, decalage + 2)
    octets.writeUInt8(j === source ? 0 : DRAPEAUX, decalage + 4)
  }
  return octets
}

/** `voisins-4km.bin` : la gare la plus proche pour chaque point de France, sinon 65535. */
function voisins(): Buffer {
  const g = grille()
  const dedans = Buffer.from(g.dedans, 'base64')
  const octets = Buffer.alloc(g.nx * g.ny * NB_VOISINS * 4)
  for (let k = 0; k < g.nx * g.ny; k++) {
    const base = k * NB_VOISINS * 4
    for (let v = 0; v < NB_VOISINS; v++) octets.writeUInt16LE(INJOIGNABLE, base + v * 4)
    if (dedans[k] !== 1) continue
    const lon = g.lon0 + (k % g.nx) * g.pasLon
    const lat = g.lat0 + Math.floor(k / g.nx) * g.pasLat
    const distances = GARES.map((s, gare) => ({ gare, km: haversineKm(lat, lon, s.lat, s.lon) }))
    distances.sort((a, b) => a.km - b.km)
    distances.forEach((d, v) => {
      octets.writeUInt16LE(d.gare, base + v * 4)
      octets.writeUInt16LE(Math.min(HECTOMETRES_MAX, Math.round(d.km * 10)), base + v * 4 + 2)
    })
  }
  return octets
}

export interface HorairesSimules {
  /** Passer à false fait répondre 404 à tous les fichiers d'horaires. */
  disponibles: boolean
}

const binaire = (corps: Buffer): Parameters<Route['fulfill']>[0] => ({
  body: corps,
  contentType: 'application/octet-stream',
})

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Sert des horaires synthétiques à la place des fichiers de `public/data/tc`. */
export async function simulerHoraires(page: Page): Promise<HorairesSimules> {
  const etat: HorairesSimules = { disponibles: true }
  const cacheVoisins = voisins()
  await page.route('**/data/tc/**', async (route) => {
    if (!etat.disponibles) return route.fulfill({ status: 404, body: '' })
    const chemin = new URL(route.request().url()).pathname
    if (chemin.endsWith('stations.json')) {
      await attendre(DELAI_MS)
      return route.fulfill({ json: GARES })
    }
    if (chemin.endsWith('voisins-4km.bin')) return route.fulfill(binaire(cacheVoisins))
    const source = Number(chemin.split('/').pop()!.replace('.bin', ''))
    if (Number.isInteger(source) && source >= 0 && source < GARES.length) return route.fulfill(binaire(ligne(source)))
    return route.fulfill({ status: 404, body: '' })
  })
  return etat
}
