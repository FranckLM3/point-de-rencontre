import { expect, test } from 'vitest'
import { ETAT_DEFAUT, ecrireEtat, lireEtat } from '../../src/etat/url'
import type { Etat } from '../../src/types'

test('URL vide : état par défaut', () => {
  expect(lireEtat('')).toEqual(ETAT_DEFAUT)
})

test('aller-retour complet', () => {
  const e: Etat = {
    mode: 'oiseau', critere: 'moyenne', max: 300,
    selection: ['a1', 'b2'], lieu: { lat: 45.75, lon: 4.85, label: 'Lyon, Rhône' },
  }
  expect(lireEtat(ecrireEtat(e))).toEqual(e)
})

test('sélection vide conservée', () => {
  expect(lireEtat(ecrireEtat({ ...ETAT_DEFAUT, selection: [] })).selection).toEqual([])
})

test('valeurs invalides ignorées', () => {
  expect(lireEtat('?mode=avion&critere=x&max=-3&lieu=abc')).toEqual(ETAT_DEFAUT)
})

test('lieu avec des parties vides rejeté', () => {
  expect(lireEtat('?lieu=,,x').lieu).toBeNull()
})

test('lieu hors bornes rejeté', () => {
  expect(lireEtat('?lieu=91,2,Nord').lieu).toBeNull()
  expect(lireEtat('?lieu=45,181,Est').lieu).toBeNull()
})

test('aller-retour avec un label contenant & et =', () => {
  const e: Etat = {
    ...ETAT_DEFAUT,
    lieu: { lat: 45.75, lon: 4.85, label: 'Lyon & Villeurbanne = agglo' },
  }
  expect(lireEtat(ecrireEtat(e))).toEqual(e)
})
