import { expect, test } from 'vitest'
import { ETAT_DEFAUT } from '../../src/etat/url'
import type { Ami } from '../../src/types'
import { amisChoisis, cleFocus, cleZones, libelleClic } from '../../src/ui/assemblage'

const ami = (id: string): Ami => ({ id, nom: id, adresse: 'x', lat: 45, lon: 3, transport: 'tc', navigo: false })

test('cleZones ne dépend ni du lieu ni de l’ordre des personnes', () => {
  const base = cleZones(ETAT_DEFAUT, ['b', 'a'], 1)
  expect(cleZones({ ...ETAT_DEFAUT, lieu: { lat: 1, lon: 2, label: 'X' } }, ['a', 'b'], 1)).toBe(base)
})

test('cleZones change avec le critère, le maximum, la sélection et la version', () => {
  const base = cleZones(ETAT_DEFAUT, ['a', 'b'], 1)
  expect(cleZones({ ...ETAT_DEFAUT, critere: 'moyenne' }, ['a', 'b'], 1)).not.toBe(base)
  expect(cleZones({ ...ETAT_DEFAUT, max: 300 }, ['a', 'b'], 1)).not.toBe(base)
  expect(cleZones(ETAT_DEFAUT, ['a'], 1)).not.toBe(base)
  expect(cleZones(ETAT_DEFAUT, ['a', 'b'], 2)).not.toBe(base)
})

test('cleZones ne modifie pas la liste reçue', () => {
  const ids = ['b', 'a']
  cleZones(ETAT_DEFAUT, ids, 0)
  expect(ids).toEqual(['b', 'a'])
})

test('amisChoisis : null vaut tout le monde, sinon les identifiants connus', () => {
  const amis = [ami('a'), ami('b')]
  expect(amisChoisis(amis, null)).toEqual(amis)
  expect(amisChoisis(amis, ['b', 'disparu']).map((a) => a.id)).toEqual(['b'])
})

test('cleFocus retrouve un élément reconstruit', () => {
  const el = document.createElement('div')
  el.innerHTML = `
    <input data-id='x"y' />
    <button data-action="tous"></button>
    <button data-critere="pire"></button>
    <select aria-label="Distance maximum"></select>
    <button id="sortir"></button>
    <span></span>`
  for (const cible of el.querySelectorAll(':not(span)')) {
    const sel = cleFocus(cible)!
    expect(el.querySelector(sel)).toBe(cible)
  }
  expect(cleFocus(el.querySelector('span'))).toBeNull()
  expect(cleFocus(null)).toBeNull()
})

test('libellé d’un point touché sur la carte', () => {
  expect(libelleClic(43.29651, 5.36978)).toBe('Point 43.297, 5.370')
})
