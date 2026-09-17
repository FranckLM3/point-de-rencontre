import type { Groupe } from '../types'
import { supabase } from './supabase'

export async function listerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase().from('groupes').select('id, nom, amis').order('nom')
  if (error) throw new Error(`Impossible de charger les groupes : ${error.message}`)
  return data ?? []
}

export async function enregistrerGroupe(nom: string, amis: string[]): Promise<Groupe> {
  const propre = nom.trim()
  if (propre.length < 1 || propre.length > 40) throw new Error('Le nom du groupe doit faire entre 1 et 40 caractères.')
  const { data, error } = await supabase()
    .from('groupes')
    .upsert({ nom: propre, amis }, { onConflict: 'nom' })
    .select('id, nom, amis')
    .single()
  if (error || !data) throw new Error(`Impossible d’enregistrer le groupe : ${error?.message ?? 'réponse vide'}`)
  return data
}
