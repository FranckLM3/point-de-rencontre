import type { Ami, NouvelAmi } from '../types'
import { supabase } from './supabase'

const COLONNES = 'id, nom, adresse, lat, lon, transport, navigo'
const TRANSPORTS = ['voiture', 'tc']
/** PostgREST : .single() n'a trouvé aucune ligne (personne supprimée entre-temps). */
const CODE_LIGNE_ABSENTE = 'PGRST116'

export function validerAmi(a: NouvelAmi): NouvelAmi {
  const nom = a.nom.trim()
  if (nom.length < 1 || nom.length > 60) throw new Error('Le nom doit faire entre 1 et 60 caractères.')
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) throw new Error('Coordonnées invalides.')
  if (a.lat < 41 || a.lat > 51.5 || a.lon < -5.5 || a.lon > 10) {
    throw new Error('L’adresse doit être en France métropolitaine.')
  }
  const adresse = a.adresse.trim()
  if (adresse.length < 3 || adresse.length > 200) throw new Error('L’adresse doit faire entre 3 et 200 caractères.')
  if (!TRANSPORTS.includes(a.transport)) throw new Error('Choisis un moyen de transport : voiture ou transports en commun.')
  return { nom, adresse, lat: a.lat, lon: a.lon, transport: a.transport, navigo: a.navigo }
}

interface ErreurSupabase {
  message: string
  code?: string
}

/** Journalise le détail technique côté console, sans le montrer à l'utilisateur ; `phrase` complète « Impossible … ». */
function verifier<T>(data: T | null, error: ErreurSupabase | null, phrase: string): T {
  if (error) {
    console.error(`Erreur Supabase (${phrase}) :`, error)
    if (error.code === CODE_LIGNE_ABSENTE) throw new Error('Cette personne a été supprimée entre-temps.')
    throw new Error(`Impossible ${phrase}.`)
  }
  if (data === null) {
    console.error(`Réponse Supabase vide (${phrase}).`)
    throw new Error(`Impossible ${phrase}.`)
  }
  return data
}

export async function listerAmis(): Promise<Ami[]> {
  const { data, error } = await supabase().from('amis').select(COLONNES).order('nom')
  return verifier(data, error, 'de charger les personnes')
}

export async function ajouterAmi(a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').insert(validerAmi(a)).select(COLONNES).single()
  return verifier(data, error, 'd’ajouter la personne')
}

export async function modifierAmi(id: string, a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').update(validerAmi(a)).eq('id', id).select(COLONNES).single()
  return verifier(data, error, 'de modifier la personne')
}

export async function supprimerAmi(id: string): Promise<void> {
  const { error } = await supabase().from('amis').delete().eq('id', id)
  if (error) {
    console.error('Erreur Supabase (de supprimer la personne) :', error)
    throw new Error('Impossible de supprimer la personne.')
  }
}
