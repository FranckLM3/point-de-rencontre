import type { Ami } from '../types'

interface Adresse {
  codePostal: string
  ville: string
}

/** Préfixe des 3 premiers chiffres du code postal : villes à arrondissements numérotés. */
const PREFIXES_ARRONDISSEMENT: Record<string, string> = { '750': 'Paris', '690': 'Lyon', '130': 'Marseille' }

function decouperAdresse(adresse: string): Adresse {
  const correspondance = adresse.match(/(\d{5})\s*([^\d]+)$/)
  if (!correspondance) return { codePostal: '', ville: adresse.trim() }
  return { codePostal: correspondance[1]!, ville: correspondance[2]!.trim() }
}

const ordinal = (n: number): string => (n === 1 ? '1er' : `${n}e`)

/** Nom affiché sous une personne : « Paris 19e » pour un arrondissement connu, sinon la ville. */
export function villeCourte(adresse: string): string {
  const { codePostal, ville } = decouperAdresse(adresse)
  const nomVille = PREFIXES_ARRONDISSEMENT[codePostal.slice(0, 3)]
  const numero = Number(codePostal.slice(3))
  if (nomVille && numero >= 1) return `${nomVille} ${ordinal(numero)}`
  return ville || adresse
}

/** Ville utilisée pour regrouper la liste : les arrondissements d'une même ville se retrouvent ensemble. */
export function villeDeGroupe(adresse: string): string {
  const { codePostal, ville } = decouperAdresse(adresse)
  return PREFIXES_ARRONDISSEMENT[codePostal.slice(0, 3)] ?? (ville || adresse)
}

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Recherche insensible aux accents et à la casse, sur le nom ou la ville (avec ou sans arrondissement). */
export function correspond(a: Ami, recherche: string): boolean {
  const q = sansAccents(recherche.trim())
  if (!q) return true
  return sansAccents(a.nom).includes(q) || sansAccents(villeCourte(a.adresse)).includes(q) || sansAccents(villeDeGroupe(a.adresse)).includes(q)
}

export interface GroupeVille {
  ville: string
  amis: Ami[]
}

/** Trie par ville de regroupement puis par nom ; une entrée par ville, dans l'ordre alphabétique. */
export function regrouperParVille(amis: Ami[]): GroupeVille[] {
  const tries = [...amis].sort(
    (a, b) => villeDeGroupe(a.adresse).localeCompare(villeDeGroupe(b.adresse), 'fr') || a.nom.localeCompare(b.nom, 'fr'),
  )
  const groupes: GroupeVille[] = []
  for (const a of tries) {
    const ville = villeDeGroupe(a.adresse)
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.ville === ville) dernier.amis.push(a)
    else groupes.push({ ville, amis: [a] })
  }
  return groupes
}
