import type { Grille } from '../calcul/grille'
import type { Ville } from '../types'

export interface PrixCarburant {
  gazole: number
  sp95: number
  e10: number
  date: string
}

interface GrilleBrute extends Omit<Grille, 'dedans'> {
  dedans: string
}

export function decoderGrille(brut: GrilleBrute): Grille {
  const octets = Uint8Array.from(atob(brut.dedans), (c) => c.charCodeAt(0))
  if (octets.length !== brut.nx * brut.ny) {
    throw new Error(`grille invalide : ${octets.length} points pour ${brut.nx}x${brut.ny}`)
  }
  return { ...brut, dedans: octets }
}

async function lireJson<T>(chemin: string): Promise<T> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}${chemin}`)
  if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`)
  return (await reponse.json()) as T
}

export async function chargerGrille(): Promise<Grille> {
  return decoderGrille(await lireJson<GrilleBrute>('data/grille-4km.json'))
}

export function chargerVilles(): Promise<Ville[]> {
  return lireJson<Ville[]>('data/villes.json')
}

/** Grille de 8 km utilisée par la couche voiture (même format que la grille de 4 km). */
export async function chargerGrille8km(): Promise<Grille> {
  return decoderGrille(await lireJson<GrilleBrute>('data/grille-8km.json'))
}

/** Prix moyen national des carburants, mis à jour à chaque publication (repli sur le fichier commité). */
export function chargerCarburant(): Promise<PrixCarburant> {
  return lireJson<PrixCarburant>('data/carburant.json')
}
