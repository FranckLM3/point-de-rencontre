import { expect, test, vi } from 'vitest'
import { rendreRepaire } from '../../src/ui/repaire'

test('sans repaire, rien n’est affiché', () => {
  const el = document.createElement('div')
  el.innerHTML = 'ancien'
  rendreRepaire(el, null, 'km', vi.fn())
  expect(el.innerHTML).toBe('')
})

test('affiche la ville la plus proche, le pire trajet et le total, échappés', () => {
  const el = document.createElement('div')
  const voir = vi.fn()
  rendreRepaire(el, { ville: '<b>Villeurbanne</b>', pire: 139, total: 574 }, 'min', voir)
  expect(el.querySelector('b')).toBeNull()
  expect(el.textContent).toContain('Le repaire')
  expect(el.textContent).toContain('près de <b>Villeurbanne</b>')
  expect(el.textContent).toContain('2 h 19 au pire')
  expect(el.textContent).toContain('9 h 34 au total')
  const bouton = el.querySelector<HTMLButtonElement>('button')!
  expect(bouton.textContent).toBe('Voir sur la carte')
  bouton.click()
  expect(voir).toHaveBeenCalled()
})

test('en km, la valeur reste en km', () => {
  const el = document.createElement('div')
  rendreRepaire(el, { ville: 'Mâcon', pire: 340, total: 1419 }, 'km', vi.fn())
  expect(el.textContent).toContain('340 km au pire')
  expect(el.textContent).toContain('1419 km au total')
})

test('en moyenne, la moyenne passe en premier, puis le pire trajet', () => {
  const el = document.createElement('div')
  rendreRepaire(el, { ville: 'Meyzieu', pire: 139, total: 521, nombre: 5 }, 'min', vi.fn(), 'moyenne')
  const ligne = el.querySelector('.ligne')!.textContent!
  expect(ligne).toBe('près de Meyzieu · 1 h 44 en moyenne · 2 h 19 au pire')
})

test('au pire trajet, le pire passe en premier, puis le total', () => {
  const el = document.createElement('div')
  rendreRepaire(el, { ville: 'Meyzieu', pire: 139, total: 521, nombre: 5 }, 'min', vi.fn(), 'pire')
  expect(el.querySelector('.ligne')!.textContent).toBe('près de Meyzieu · 2 h 19 au pire · 8 h 41 au total')
})

test('bouton « ? » : explique le calcul selon le critère, le moyen et la durée max', () => {
  const el = document.createElement('div')
  rendreRepaire(el, { ville: 'Mâcon', pire: 139, total: 521, nombre: 5 }, 'min', vi.fn(), 'moyenne', { mode: 'mixte', max: 240 })
  const aide = el.querySelector('details.aide')!
  expect(aide.querySelector('summary')!.textContent).toContain('Comment le repaire est-il calculé ?')
  const texte = aide.textContent!
  expect(texte).toContain('le trajet moyen est le plus court')
  expect(texte).toContain('sans que personne ne dépasse 4 h')
  expect(texte).toContain('Chacun y va avec son moyen')
  expect(texte).toContain('carrés de 4 km')
})

test('aide au pire trajet, en prix et tous en train', () => {
  const el = document.createElement('div')
  rendreRepaire(el, { ville: 'Mâcon', pire: 60, total: 200 }, 'eur', vi.fn(), 'pire', { mode: 'tc', max: null })
  const texte = el.querySelector('details.aide')!.textContent!
  expect(texte).toContain('le prix le plus élevé est le plus bas')
  expect(texte).not.toContain('sans que personne')
  expect(texte).toContain('Tout le monde y va en train')
})
