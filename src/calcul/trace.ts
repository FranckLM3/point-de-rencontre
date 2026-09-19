import type { MoteurTc, MoteurVoiture } from './couches'
import type { Itineraires } from '../donnees/voiture'
import type { Rails } from '../donnees/rails'
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
  /**
   * Points [lat, lon] du tracé à dessiner entre la première et la dernière gare de `chemin` :
   * suit les voies réelles entre deux gares consécutives quand `rails` en connaît le tracé,
   * sinon un segment droit entre elles. Même longueur que `chemin` ou plus (points intermédiaires
   * insérés) ; null quand `chemin` l'est.
   */
  trace: [number, number][] | null
  /** Indices des gares de départ et d'arrivée, présents seulement avec `chemin`. */
  gareDepart: number | null
  gareArrivee: number | null
  /** Vrai en mode transports quand le trajet le plus rapide ne passe par aucune gare. */
  directSansTrain: boolean
  /** Vrai quand le trajet est effectivement fait en voiture (mode voiture, ou mixte avec la
   * couche prête) : ligne droite pointillée sur la carte, sauf itinéraire routier connu (`traceVoiture`). */
  enVoiture: boolean
  /**
   * Points [lat, lon] de l'itinéraire routier réel du domicile vers la cible, quand `itineraires`
   * le connaît déjà (chargé paresseusement, en cache pour la session) ; null tant qu'il n'est pas
   * en cache (ligne droite pointillée en attendant, src/ui/carte.ts) ou hors mode voiture.
   */
  traceVoiture: [number, number][] | null
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

/**
 * Points à dessiner entre les gares de `chemin` (dans l'ordre) : la portion réelle des voies
 * entre deux gares consécutives quand `rails` la connaît (`indices` leur est aligné), sinon un
 * segment droit entre elles ; les points de jonction restent ceux des gares (pas ceux, proches
 * mais distincts, du nœud de voie le plus proche), pour rester cohérents avec leurs marqueurs.
 */
function construireTrace(indices: number[], chemin: CoordGare[], rails: Rails | null): [number, number][] {
  const points: [number, number][] = [[chemin[0]!.lat, chemin[0]!.lon]]
  for (let i = 1; i < chemin.length; i++) {
    const segment = rails?.segment(indices[i - 1]!, indices[i]!) ?? null
    if (segment) for (const p of segment.slice(1, -1)) points.push(p)
    points.push([chemin[i]!.lat, chemin[i]!.lon])
  }
  return points
}

/** Trajet d'un groupe (calculé sur son premier membre) vers la cible, en mode transports. */
function trajetGroupeTc(
  moteur: MoteurTc,
  representant: Ami,
  cible: Lieu,
  rails: Rails | null,
): Pick<PersonneTrajetCarte, 'chemin' | 'trace' | 'gareDepart' | 'gareArrivee' | 'directSansTrain'> {
  const d = moteur.depuis(representant)
  const t = versPointTc(moteur.horaires, d, representant, cible.lat, cible.lon, moteur.gares(cible.lat, cible.lon))
  if (!t || t.departIndice === null || t.arriveeIndice === null) {
    return { chemin: null, trace: null, gareDepart: null, gareArrivee: null, directSansTrain: t !== null }
  }
  const ligne = moteur.horaires.ligne(t.departIndice)
  const indices = ligne ? cheminGares(ligne, t.departIndice, t.arriveeIndice) : [t.departIndice, t.arriveeIndice]
  const chemin = indices.map((i) => {
    const s = moteur.horaires.stations[i]!
    return { lat: s.lat, lon: s.lon, nom: s.nom }
  })
  const trace = construireTrace(indices, chemin, rails)
  return { chemin, trace, gareDepart: t.departIndice, gareArrivee: t.arriveeIndice, directSansTrain: false }
}

const SANS_TRAIN = {
  chemin: null, trace: null, gareDepart: null, gareArrivee: null, directSansTrain: false, traceVoiture: null,
} as const

/** Points [lat, lon] de l'itinéraire routier connu du domicile vers la cible, sinon null (ligne
 * droite pointillée en attendant ou en l'absence d'`itineraires`, décidé par l'appelant). */
function traceVoitureVers(representant: Ami, cible: Lieu, itineraires: Itineraires | null): [number, number][] | null {
  const itineraire = itineraires?.regarder({ lat: representant.lat, lon: representant.lon }, { lat: cible.lat, lon: cible.lon })
  return itineraire ? itineraire.coordonnees : null
}

/**
 * Trajets à dessiner sur la carte pour la cible choisie (ville, étiquette ou lieu testé), un par
 * point de départ distinct. En mode transports (ou en mixte pour une personne en transports), le
 * chemin suit les gares réelles (`cheminGares`) ; en voiture (mode voiture, ou mixte avec la couche
 * prête), l'itinéraire routier réel quand `itineraires` le connaît déjà, sinon une ligne droite
 * pointillée en attendant (décision 7 assouplie : le tracé de route remplace la ligne droite une
 * fois chargé) ; sinon une ligne droite pleine.
 */
export function personnesTrajetCarte(
  amis: Ami[],
  mode: Mode,
  moteurTc: MoteurTc | null,
  moteurVoiture: MoteurVoiture | null,
  cible: Lieu | null,
  rails: Rails | null = null,
  itineraires: Itineraires | null = null,
): PersonneTrajetCarte[] {
  if (!cible) return []
  return grouperParDepart(amis).map((groupe) => {
    const representant = groupe[0]!
    const base = { noms: groupe.map((a) => a.nom), lat: representant.lat, lon: representant.lon }
    if (mode === 'voiture') {
      return { ...base, ...SANS_TRAIN, enVoiture: true, traceVoiture: traceVoitureVers(representant, cible, itineraires) }
    }
    if (mode === 'mixte') {
      const coucheVoiturePrete = representant.transport === 'voiture' && moteurVoiture?.couche(representant.id) !== undefined
      if (coucheVoiturePrete) {
        return { ...base, ...SANS_TRAIN, enVoiture: true, traceVoiture: traceVoitureVers(representant, cible, itineraires) }
      }
      if (moteurTc) return { ...base, ...trajetGroupeTc(moteurTc, representant, cible, rails), enVoiture: false, traceVoiture: null }
      return { ...base, ...SANS_TRAIN, enVoiture: false }
    }
    if (mode !== 'tc' || !moteurTc) return { ...base, ...SANS_TRAIN, enVoiture: false }
    return { ...base, ...trajetGroupeTc(moteurTc, representant, cible, rails), enVoiture: false, traceVoiture: null }
  })
}
