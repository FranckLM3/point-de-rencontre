import type { Ami, NouvelAmi } from '../types'
import { supabase } from './supabase'

const COLONNES = 'id, nom, adresse, lat, lon, transport, navigo'
const TRANSPORTS = ['voiture', 'tc']

export function validerAmi(a: NouvelAmi): NouvelAmi {
  const nom = a.nom.trim()
  if (nom.length < 1 || nom.length > 60) throw new Error('Le nom doit faire entre 1 et 60 caractères.')
  if (a.lat < 41 || a.lat > 51.5 || a.lon < -5.5 || a.lon > 10) {
    throw new Error('L’adresse doit être en France métropolitaine.')
  }
  if (!TRANSPORTS.includes(a.transport)) throw new Error('Choisis un moyen de transport : voiture ou transports en commun.')
  return { ...a, nom, adresse: a.adresse.trim() }
}

function verifier<T>(data: T | null, error: { message: string } | null, action: string): T {
  if (error || data === null) throw new Error(`Impossible de ${action} : ${error?.message ?? 'réponse vide'}`)
  return data
}

export async function listerAmis(): Promise<Ami[]> {
  const { data, error } = await supabase().from('amis').select(COLONNES).order('nom')
  return verifier(data, error, 'charger les amis')
}

export async function ajouterAmi(a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').insert(validerAmi(a)).select(COLONNES).single()
  return verifier(data, error, 'ajouter l’ami')
}

export async function modifierAmi(id: string, a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').update(validerAmi(a)).eq('id', id).select(COLONNES).single()
  return verifier(data, error, 'modifier l’ami')
}

export async function supprimerAmi(id: string): Promise<void> {
  const { error } = await supabase().from('amis').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer l’ami : ${error.message}`)
}
