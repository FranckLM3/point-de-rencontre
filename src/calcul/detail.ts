import type { MoteurTc, MoteurVoiture } from './couches'
import { haversineKm } from './geo'
import { cheminGares, versPointTc, type TrajetTc } from './tc'
import { valeurVoiture, type ValeurVoiture } from './voiture'
import type { Ami, Mode } from '../types'

/** Trajet d'une personne vers un point, avec ses étapes, pour la fiche qui s'ouvre au clic. */
export type TrajetDetaille =
  | { moyen: 'tc'; trajet: TrajetTc; via: string[] }
  | { moyen: 'voiture'; valeur: ValeurVoiture }
  | { moyen: 'oiseau'; km: number }

function enTransports(moteur: MoteurTc, a: Ami, lat: number, lon: number): TrajetDetaille | null {
  const t = versPointTc(moteur.horaires, moteur.depuis(a), a, lat, lon, moteur.gares(lat, lon))
  if (!t) return null
  if (t.departIndice === null || t.arriveeIndice === null) return { moyen: 'tc', trajet: t, via: [] }
  const ligne = moteur.horaires.ligne(t.departIndice)
  const indices = ligne ? cheminGares(ligne, t.departIndice, t.arriveeIndice) : []
  // Gares intermédiaires du chemin : celles où l'on change de train.
  const via = indices.slice(1, -1).map((i) => moteur.horaires.stations[i]!.nom)
  return { moyen: 'tc', trajet: t, via }
}

function enVoiture(moteur: MoteurVoiture, a: Ami, lat: number, lon: number): TrajetDetaille | null {
  const couche = moteur.couche(a.id)
  if (!couche) return null
  const v = valeurVoiture(moteur.grille8, moteur.index8, couche, lon, lat)
  return v ? { moyen: 'voiture', valeur: v } : null
}

/** Même choix de moyen que `choisirMesure` (src/calcul/couches.ts) : transports, voiture, ou
 * vol d'oiseau quand le calcul correspondant n'est pas disponible. */
export function trajetDetaille(
  mode: Mode,
  moteurTc: MoteurTc | null,
  moteurVoiture: MoteurVoiture | null,
  a: Ami,
  lat: number,
  lon: number,
): TrajetDetaille | null {
  const oiseau: TrajetDetaille = { moyen: 'oiseau', km: haversineKm(a.lat, a.lon, lat, lon) }
  const tc = (): TrajetDetaille | null => (moteurTc ? enTransports(moteurTc, a, lat, lon) : oiseau)
  if (mode === 'tc') return tc()
  if (mode === 'voiture') return moteurVoiture ? enVoiture(moteurVoiture, a, lat, lon) : oiseau
  if (mode === 'mixte') {
    if (a.transport !== 'voiture') return tc()
    return (moteurVoiture ? enVoiture(moteurVoiture, a, lat, lon) : null) ?? tc()
  }
  return oiseau
}
