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
