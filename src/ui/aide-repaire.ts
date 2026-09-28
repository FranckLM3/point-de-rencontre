import type { Unite } from '../calcul/unites'
import type { Critere, Mode } from '../types'
import { valeur } from './format'

export interface ContexteAide {
  mode: Mode
  max: number | null
  /** Réglage « Par foyer » : une même adresse ne compte qu'un trajet. */
  parFoyer?: boolean
}

/** Ce que le repaire rend le plus petit, selon la grandeur et le critère. */
const OBJECTIF: Record<Unite, Record<Critere, string>> = {
  min: { moyenne: 'le trajet moyen est le plus court', pire: 'le trajet le plus long est le plus court' },
  eur: { moyenne: 'le prix moyen est le plus bas', pire: 'le prix le plus élevé est le plus bas' },
  km: { moyenne: 'la distance moyenne est la plus courte', pire: 'la plus grande distance est la plus courte' },
}

const MOYEN: Record<Mode, string> = {
  mixte: 'Chacun y va avec son moyen : en voiture pour qui a choisi Voiture, en train sinon.',
  tc: 'Tout le monde y va en train.',
  voiture: 'Tout le monde y va en voiture.',
  oiseau: 'Les distances sont mesurées à vol d’oiseau, faute de données de trajet.',
}

const TRAIN =
  'En train : horaires SNCF réels d’un mardi, départs de 6 h à 20 h, correspondances comprises, avec l’heure du dernier retour qui ramène chez soi avant minuit. ' +
  'Pour rejoindre la gare et en repartir : à pied jusqu’à 1,5 km ; en métro, RER ou tram (horaires réels) en Île-de-France, à Lyon et à Marseille ; en voiture ailleurs.'
const VOITURE = 'En voiture : durée et distance sur la route réelle ; le prix compte le carburant et un péage estimé.'

function paragraphes(unite: Unite, critere: Critere, c: ContexteAide): string[] {
  const limite = c.max !== null ? `, sans que personne ne dépasse ${valeur(c.max, unite)}` : ''
  const moyens = c.mode === 'tc' ? [TRAIN] : c.mode === 'voiture' ? [VOITURE] : c.mode === 'mixte' ? [TRAIN, VOITURE] : []
  const foyer = c.parFoyer
    ? 'Les Crocos qui partent de la même adresse avec le même moyen comptent pour un seul trajet (réglage « Par foyer »).'
    : 'Chaque Croco coché compte un trajet, même à deux à la même adresse ; « Par foyer » n’en compte qu’un.'
  return [
    `Parmi les Crocos cochés, le repaire est la ville où ${OBJECTIF[unite][critere]}${limite}. Les deux suivantes sont les meilleures à 50 km au moins de la première ; « ça se vaut » signale un écart trop petit pour départager.`,
    MOYEN[c.mode],
    foyer,
    ...moyens,
    'Le classement porte sur les communes de plus de 20000 habitants, calculées à leur centre. Les zones vertes, elles, couvrent toute la France par carrés de 4 km.',
  ]
}

/** Bouton « ? » dépliable (details/summary natif : clavier et lecteur d'écran sans script). */
export function aideRepaire(unite: Unite, critere: Critere, c: ContexteAide): string {
  const texte = paragraphes(unite, critere, c).map((p) => `<p>${p}</p>`).join('')
  return `<details class="aide"><summary><span aria-hidden="true">?</span><span class="invisible">Comment le repaire est-il calculé ?</span></summary><div class="aide-texte">${texte}</div></details>`
}
