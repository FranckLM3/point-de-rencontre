import type { MoteurTc, MoteurVoiture } from './couches'
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
  /** Vrai quand le trajet est effectivement fait en voiture (mode voiture, ou mixte avec la
   * couche prête) : ligne droite pointillée sur la carte (décision 7, pas de tracé de route). */
  enVoiture: boolean
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
function trajetGroupeTc(
  moteur: MoteurTc,
  representant: Ami,
  cible: Lieu,
): Pick<PersonneTrajetCarte, 'chemin' | 'gareDepart' | 'gareArrivee' | 'directSansTrain'> {
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

const SANS_TRAIN = { chemin: null, gareDepart: null, gareArrivee: null, directSansTrain: false } as const

/**
 * Trajets à dessiner sur la carte pour la cible choisie (ville, étiquette ou lieu testé), un par
 * point de départ distinct. En mode transports (ou en mixte pour une personne en transports), le
 * chemin suit les gares réelles (`cheminGares`) ; en voiture (mode voiture, ou mixte avec la
 * couche prête), une ligne droite pointillée (décision 7) ; sinon une ligne droite pleine.
 */
export function personnesTrajetCarte(
  amis: Ami[],
  mode: Mode,
  moteurTc: MoteurTc | null,
  moteurVoiture: MoteurVoiture | null,
  cible: Lieu | null,
): PersonneTrajetCarte[] {
  if (!cible) return []
  return grouperParDepart(amis).map((groupe) => {
    const representant = groupe[0]!
    const base = { noms: groupe.map((a) => a.nom), lat: representant.lat, lon: representant.lon }
    if (mode === 'voiture') return { ...base, ...SANS_TRAIN, enVoiture: true }
    if (mode === 'mixte') {
      const coucheVoiturePrete = representant.transport === 'voiture' && moteurVoiture?.couche(representant.id) !== undefined
      if (coucheVoiturePrete) return { ...base, ...SANS_TRAIN, enVoiture: true }
      if (moteurTc) return { ...base, ...trajetGroupeTc(moteurTc, representant, cible), enVoiture: false }
      return { ...base, ...SANS_TRAIN, enVoiture: false }
    }
    if (mode !== 'tc' || !moteurTc) return { ...base, ...SANS_TRAIN, enVoiture: false }
    return { ...base, ...trajetGroupeTc(moteurTc, representant, cible), enVoiture: false }
  })
}
