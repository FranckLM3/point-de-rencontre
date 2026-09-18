/// <reference types="node" />
import { readFileSync } from 'node:fs'
import type { Page, Route } from '@playwright/test'

interface GrilleBrute {
  lon0: number
  lat0: number
  pasLon: number
  pasLat: number
  nx: number
  ny: number
  dedans: string
}

function grille8(): GrilleBrute {
  return JSON.parse(readFileSync('public/data/grille-8km.json', 'utf8')) as GrilleBrute
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const versRad = (d: number): number => (d * Math.PI) / 180
  const dLat = versRad(lat2 - lat1)
  const dLon = versRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(versRad(lat1)) * Math.cos(versRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Vitesse conventionnelle pour synthétiser une couche voiture plausible (à vol d'oiseau, comme la note du plan 3). */
const VITESSE_KMH = 80

/** Couche voiture synthétique (encodage réel : uint16 minutes puis uint16 km, points « en France » de la grille de 8 km). */
function coucheDepuis(lat: number, lon: number): { minutes: Buffer; km: Buffer } {
  const g = grille8()
  const dedans = Buffer.from(g.dedans, 'base64')
  const nbFrance = [...dedans].filter((v) => v === 1).length
  const minutes = Buffer.alloc(nbFrance * 2)
  const km = Buffer.alloc(nbFrance * 2)
  let compact = 0
  for (let i = 0; i < g.nx * g.ny; i++) {
    if (dedans[i] !== 1) continue
    const col = i % g.nx
    const lig = Math.floor(i / g.nx)
    const plon = g.lon0 + col * g.pasLon
    const plat = g.lat0 + lig * g.pasLat
    const distance = haversineKm(lat, lon, plat, plon)
    minutes.writeUInt16LE(Math.min(65535, Math.round((distance / VITESSE_KMH) * 60)), compact * 2)
    km.writeUInt16LE(Math.min(65535, Math.round(distance)), compact * 2)
    compact++
  }
  return { minutes, km }
}

const versBytea = (b: Buffer): string => `\\x${b.toString('hex')}`

export interface VoitureSimulee {
  /** Personnes dont la couche voiture est « prête » ; les autres restent « calcul en cours ». */
  pretes: Set<string>
}

interface PersonnePoint {
  id: string
  lat: number
  lon: number
}

function idsDemandes(route: Route): string[] {
  const brut = new URL(route.request().url()).searchParams.get('ami_id') ?? ''
  return brut.replace(/^in\.\(/, '').replace(/\)$/, '').split(',').filter(Boolean)
}

/**
 * Sert `/rest/v1/temps` (lecture des couches voiture déjà calculées) et `/functions/v1/voiture`
 * (déclenchement du calcul, résout après un court délai et marque la personne comme prête).
 */
export async function simulerVoiture(page: Page, amis: PersonnePoint[], pretesInitialement: string[] = []): Promise<VoitureSimulee> {
  const etat: VoitureSimulee = { pretes: new Set(pretesInitialement) }
  const parPersonne = new Map(amis.map((a) => [a.id, a]))

  await page.route('http://supabase.test/rest/v1/temps**', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'méthode non simulée' } })
    const lignes = idsDemandes(route)
      .filter((id) => etat.pretes.has(id))
      .map((id) => {
        const a = parPersonne.get(id)
        if (!a) return null
        const { minutes, km } = coucheDepuis(a.lat, a.lon)
        return { ami_id: id, minutes: versBytea(minutes), km: versBytea(km) }
      })
      .filter((l): l is { ami_id: string; minutes: string; km: string } => l !== null)
    return route.fulfill({ json: lignes })
  })

  await page.route('http://supabase.test/functions/v1/voiture', async (route) => {
    await new Promise((r) => setTimeout(r, 200))
    const amiId = (route.request().postDataJSON() as { ami_id: string }).ami_id
    etat.pretes.add(amiId)
    return route.fulfill({ json: { etat: 'calcule' } })
  })

  return etat
}
