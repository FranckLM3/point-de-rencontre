import type { Grille } from '../calcul/grille'
import type { Ville } from '../types'

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
