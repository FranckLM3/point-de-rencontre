import type { MoteurTc } from './couches'
import { cheminGares, versPointTc } from './tc'
import type { Ami, Lieu, Mode } from '../types'

/** Coordonnées et nom d'une gare, pour dessiner le chemin sur la carte. */
export interface CoordGare {
  lat: number
  lon: number
  nom: string
}

/** Trajet d'une personne (ou d'un groupe partageant le même point de départ) vers la cible choisie. */
export interface PersonneTrajetCarte {
  noms: string[]
  lat: number
  lon: number
  /** Gares du trajet, dans l'ordre de circulation ; null hors mode transports ou sans train. */
  chemin: CoordGare[] | null
  /** Indices des gares de départ et d'arrivée, présents seulement avec `chemin`. */
  gareDepart: number | null
  gareArrivee: number | null
  /** Vrai en mode transports quand le trajet le plus rapide ne passe par aucune gare. */
  directSansTrain: boolean
}

/** Mêmes coordonnées, un seul trajet dessiné (D8) : deux Crocos au même point partagent leur trace. */
const cleDepart = (a: Ami): string => `${a.lat},${a.lon}`

function grouperParDepart(amis: Ami[]): Ami[][] {
  const groupes = new Map<string, Ami[]>()
  for (const a of amis) {
    const cle = cleDepart(a)
    const groupe = groupes.get(cle)
    if (groupe) groupe.push(a)
    else groupes.set(cle, [a])
  }
  return [...groupes.values()]
}

/** Trajet d'un groupe (calculé sur son premier membre) vers la cible, en mode transports. */
function trajetGroupeTc(moteur: MoteurTc, representant: Ami, cible: Lieu): Pick<PersonneTrajetCarte, 'chemin' | 'gareDepart' | 'gareArrivee' | 'directSansTrain'> {
  const d = moteur.depuis(representant)
  const t = versPointTc(moteur.horaires, d, representant, cible.lat, cible.lon, moteur.gares(cible.lat, cible.lon))
  if (!t || t.departIndice === null || t.arriveeIndice === null) {
    return { chemin: null, gareDepart: null, gareArrivee: null, directSansTrain: t !== null }
  }
  const ligne = moteur.horaires.ligne(t.departIndice)
  const indices = ligne ? cheminGares(ligne, t.departIndice, t.arriveeIndice) : [t.departIndice, t.arriveeIndice]
  const chemin = indices.map((i) => {
    const s = moteur.horaires.stations[i]!
    return { lat: s.lat, lon: s.lon, nom: s.nom }
  })
  return { chemin, gareDepart: t.departIndice, gareArrivee: t.arriveeIndice, directSansTrain: false }
}

/**
 * Trajets à dessiner sur la carte pour la cible choisie (ville, étiquette ou lieu testé), un par
 * point de départ distinct. En mode transports, le chemin suit les gares réelles (`cheminGares`) ;
 * dans les autres modes, ou sans train, `chemin` est null (ligne droite dessinée par la carte).
 */
export function personnesTrajetCarte(amis: Ami[], mode: Mode, moteur: MoteurTc | null, cible: Lieu | null): PersonneTrajetCarte[] {
  if (!cible) return []
  return grouperParDepart(amis).map((groupe) => {
    const representant = groupe[0]!
    const base = { noms: groupe.map((a) => a.nom), lat: representant.lat, lon: representant.lon }
    if (mode !== 'tc' || !moteur) return { ...base, chemin: null, gareDepart: null, gareArrivee: null, directSansTrain: false }
    return { ...base, ...trajetGroupeTc(moteur, representant, cible) }
  })
}
