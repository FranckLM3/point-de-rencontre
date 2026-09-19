import type { Unite } from '../calcul/unites'
import type { Critere, Mode } from '../types'
import { valeur } from './format'

export interface ContexteAide {
  mode: Mode
  max: number | null
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
  'En train : horaires SNCF réels d’un mardi, départs de 6 h à 20 h, correspondances comprises. ' +
  'Pour rejoindre la gare et en repartir : à pied jusqu’à 1,5 km, au-delà en voiture, ou en métro et RER en Île-de-France.'
const VOITURE = 'En voiture : durée et distance sur la route réelle ; le prix compte le carburant et un péage estimé.'

function paragraphes(unite: Unite, critere: Critere, c: ContexteAide): string[] {
  const limite = c.max !== null ? `, sans que personne ne dépasse ${valeur(c.max, unite)}` : ''
  const moyens = c.mode === 'tc' ? [TRAIN] : c.mode === 'voiture' ? [VOITURE] : c.mode === 'mixte' ? [TRAIN, VOITURE] : []
  return [
    `Parmi les Crocos cochés, le repaire est l’endroit où ${OBJECTIF[unite][critere]}${limite}.`,
    MOYEN[c.mode],
    ...moyens,
    'La France est découpée en carrés de 4 km : le repaire est le meilleur carré, nommé d’après la ville la plus proche. Les zones vertes montrent les autres carrés par tranche.',
  ]
}

/** Bouton « ? » dépliable (details/summary natif : clavier et lecteur d'écran sans script). */
export function aideRepaire(unite: Unite, critere: Critere, c: ContexteAide): string {
  const texte = paragraphes(unite, critere, c).map((p) => `<p>${p}</p>`).join('')
  return `<details class="aide"><summary><span aria-hidden="true">?</span><span class="invisible">Comment le repaire est-il calculé ?</span></summary><div class="aide-texte">${texte}</div></details>`
}
