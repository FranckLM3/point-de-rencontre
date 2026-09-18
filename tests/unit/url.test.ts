import { expect, test } from 'vitest'
import { ETAT_DEFAUT, ecrireEtat, lireEtat } from '../../src/etat/url'
import type { Etat } from '../../src/types'

test('URL vide : état par défaut', () => {
  expect(lireEtat('')).toEqual(ETAT_DEFAUT)
})

test('aller-retour complet', () => {
  const e: Etat = {
    mode: 'voiture', critere: 'moyenne', max: 300, grandeur: 'temps',
    selection: ['a1', 'b2'], lieu: { lat: 45.75, lon: 4.85, label: 'Lyon, Rhône' }, personnesParVoiture: 3,
  }
  expect(lireEtat(ecrireEtat(e))).toEqual(e)
})

test('une ancienne URL avec mode=oiseau retombe sur le mode par défaut (D1)', () => {
  expect(lireEtat('?mode=oiseau').mode).toBe(ETAT_DEFAUT.mode)
})

test('maximum par défaut : 4 h en temps, aucun en prix', () => {
  expect(lireEtat('').max).toBe(240)
  expect(lireEtat('?grandeur=prix').max).toBeNull()
})

test('maximum explicitement retiré (max=0) reste retiré, distinct de l’absence du paramètre', () => {
  expect(lireEtat(ecrireEtat({ ...ETAT_DEFAUT, max: null }))).toEqual({ ...ETAT_DEFAUT, max: null })
})

test('personnes par voiture : par défaut 1, bornée entre 1 et 4', () => {
  expect(lireEtat('').personnesParVoiture).toBe(1)
  expect(lireEtat('?parvoiture=3').personnesParVoiture).toBe(3)
  expect(lireEtat('?parvoiture=9').personnesParVoiture).toBe(1)
  expect(lireEtat('?parvoiture=0').personnesParVoiture).toBe(1)
})

test('grandeur lue, écrite, et temps par défaut', () => {
  expect(lireEtat('').grandeur).toBe('temps')
  expect(lireEtat('?grandeur=prix').grandeur).toBe('prix')
  expect(lireEtat('?grandeur=poids').grandeur).toBe('temps')
  expect(lireEtat(ecrireEtat({ ...ETAT_DEFAUT, mode: 'tc', grandeur: 'prix' })).grandeur).toBe('prix')
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
