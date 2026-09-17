import type { Lieu } from '../types'

const URL_IGN = 'https://data.geopf.fr/geocodage/search'
export const LONGUEUR_MIN = 3
const NB_PROPOSITIONS = '5'

interface ReponseIgn {
  features: { geometry: { coordinates: [number, number] }; properties: { label: string } }[]
}

export async function chercherAdresses(texte: string, f: typeof fetch = fetch): Promise<Lieu[]> {
  const q = texte.trim()
  if (q.length < LONGUEUR_MIN) return []
  const params = new URLSearchParams({ q, limit: NB_PROPOSITIONS })
  const reponse = await f(`${URL_IGN}?${params}`)
  if (!reponse.ok) throw new Error(`La recherche d’adresse a échoué (HTTP ${reponse.status}).`)
  const corps = (await reponse.json()) as ReponseIgn
  return corps.features.map((x) => ({
    label: x.properties.label,
    lon: x.geometry.coordinates[0],
    lat: x.geometry.coordinates[1],
  }))
}
