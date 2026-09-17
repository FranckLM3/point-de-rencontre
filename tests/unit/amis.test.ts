import { expect, test } from 'vitest'
import { validerAmi } from '../../src/donnees/amis'
import type { NouvelAmi } from '../../src/types'

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
