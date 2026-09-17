/** Moyen de transport propre à un ami. */
export type Transport = 'voiture' | 'tc'

export interface Ami {
  id: string
  nom: string
  adresse: string
  lat: number
  lon: number
  transport: Transport
  navigo: boolean
}

export type NouvelAmi = Omit<Ami, 'id'>

export interface Groupe {
  id: string
  nom: string
  amis: string[]
}

/** mixte = chacun son moyen ; voiture / tc = tout le monde pareil. */
export type Mode = 'mixte' | 'voiture' | 'tc' | 'oiseau'
export type Critere = 'moyenne' | 'pire'

export interface Lieu {
  lat: number
  lon: number
  label: string
}

export interface Etat {
  mode: Mode
  critere: Critere
  /** Valeur maximale (km en vol d'oiseau), null = sans limite. */
  max: number | null
  /** Identifiants cochés, null = tout le monde. */
  selection: string[] | null
  lieu: Lieu | null
}

export interface Ville {
  nom: string
  dep: string
  lat: number
  lon: number
  population: number
}
