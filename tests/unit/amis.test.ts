import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { NouvelAmi } from '../../src/types'

interface RequeteSimulee {
  select: (colonnes?: string) => RequeteSimulee
  insert: (valeurs?: unknown) => RequeteSimulee
  update: (valeurs?: unknown) => RequeteSimulee
  eq: (colonne?: string, valeur?: unknown) => RequeteSimulee
  order: (colonne?: string) => RequeteSimulee
  single: () => Promise<{ data: unknown; error: unknown }>
}

function requeteSimulee(resultat: { data: unknown; error: unknown }): RequeteSimulee {
  const q: RequeteSimulee = {
    select: () => q,
    insert: () => q,
    update: () => q,
    eq: () => q,
    order: () => q,
    single: () => Promise.resolve(resultat),
  }
  return q
}

const from = vi.fn<(table: string) => RequeteSimulee>()
vi.mock('../../src/donnees/supabase', () => ({ supabase: () => ({ from }) }))

const { validerAmi, ajouterAmi, modifierAmi } = await import('../../src/donnees/amis')

const ok: NouvelAmi = { nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'tc', navigo: true }

test('un ami valide passe', () => {
  expect(validerAmi(ok)).toEqual(ok)
})

test('le nom est nettoyé des espaces', () => {
  expect(validerAmi({ ...ok, nom: '  Léa ' }).nom).toBe('Léa')
})

test('nom vide refusé', () => {
  expect(() => validerAmi({ ...ok, nom: '  ' })).toThrow('nom')
})

test('adresse hors France métropolitaine refusée', () => {
  expect(() => validerAmi({ ...ok, lat: 16.2 })).toThrow('France')
})

test('moyen de transport inconnu refusé', () => {
  expect(() => validerAmi({ ...ok, transport: 'avion' as NouvelAmi['transport'] })).toThrow('transport')
})

test('latitude non finie refusée', () => {
  expect(() => validerAmi({ ...ok, lat: Number.NaN })).toThrow('Coordonnées invalides.')
})

test('longitude non finie refusée', () => {
  expect(() => validerAmi({ ...ok, lon: Number.POSITIVE_INFINITY })).toThrow('Coordonnées invalides.')
})

test('adresse trop courte refusée', () => {
  expect(() => validerAmi({ ...ok, adresse: ' P ' })).toThrow('L’adresse doit faire entre 3 et 200 caractères.')
})

test('adresse trop longue refusée', () => {
  expect(() => validerAmi({ ...ok, adresse: 'a'.repeat(201) })).toThrow('L’adresse doit faire entre 3 et 200 caractères.')
})

test('un champ id en trop est retiré du résultat', () => {
  const avecId = { ...ok, id: 'x' } as NouvelAmi & { id: string }
  expect(validerAmi(avecId)).toEqual(ok)
  expect(validerAmi(avecId)).not.toHaveProperty('id')
})

test('latitude à la borne 51.5 acceptée', () => {
  expect(validerAmi({ ...ok, lat: 51.5 }).lat).toBe(51.5)
})

test('nom de 61 caractères refusé', () => {
  expect(() => validerAmi({ ...ok, nom: 'a'.repeat(61) })).toThrow('nom')
})

beforeEach(() => {
  from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('PGRST116 (ligne absente) : message dédié à l’utilisateur, détail technique seulement loggé', async () => {
  const erreurTechnique = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }
  from.mockReturnValue(requeteSimulee({ data: null, error: erreurTechnique }))
  await expect(modifierAmi('x', ok)).rejects.toThrow('Cette personne a été supprimée entre-temps.')
  expect(vi.mocked(console.error).mock.calls[0]![1]).toEqual(erreurTechnique)
})

test('autre erreur Supabase : phrase générique, aucun détail technique montré à l’utilisateur', async () => {
  const erreurTechnique = { message: 'relation "amis" does not exist', code: '42P01' }
  from.mockReturnValue(requeteSimulee({ data: null, error: erreurTechnique }))
  await expect(ajouterAmi(ok)).rejects.toThrow('Impossible d’ajouter la personne.')
  try {
    await ajouterAmi(ok)
    throw new Error('devait rejeter')
  } catch (e) {
    expect((e as Error).message).not.toContain('relation "amis"')
  }
})
