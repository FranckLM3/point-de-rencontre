import { expect, test, vi } from 'vitest'
import type { Repaire } from '../../src/calcul/repaires'
import { rendreRepaires } from '../../src/ui/repaire'

const repaire = (nom: string, pire: number, moyenne: number, equivalente = false): Repaire => ({
  classee: { ville: { nom, dep: '71', lat: 46.3, lon: 4.83, population: 33000 }, parAmi: [], total: moyenne * 2, moyenne, pire },
  equivalente,
})

test('personne de coché : rien n’est affiché', () => {
  const el = document.createElement('div')
  el.innerHTML = 'ancien'
  rendreRepaires(el, [], 'km', vi.fn())
  expect(el.innerHTML).toBe('')
})

test('trois villes, la meilleure en tête, valeurs selon le critère, noms échappés', () => {
  const el = document.createElement('div')
  const voir = vi.fn()
  const liste = [repaire('<b>Mâcon</b>', 139, 104), repaire('Lyon', 145, 110, true), repaire('Dijon', 175, 130)]
  rendreRepaires(el, liste, 'min', voir, 'pire')
  expect(el.querySelector('b')).toBeNull()
  expect(el.textContent).toContain('Les repaires')
  const villes = [...el.querySelectorAll('.repaire-ville')]
  expect(villes).toHaveLength(3)
  expect(villes[0]!.querySelector('.nom')!.textContent).toBe('<b>Mâcon</b>')
  expect(villes[0]!.querySelector('.ligne')!.textContent).toBe('2 h 19 au pire · 1 h 44 en moyenne')
  expect(villes[1]!.querySelector('.equivalent')!.textContent).toBe('ça se vaut')
  expect(villes[2]!.querySelector('.equivalent')).toBeNull()
  ;(villes[1] as HTMLButtonElement).click()
  expect(voir).toHaveBeenCalledWith(liste[1])
})

test('au critère moyenne, la moyenne passe en premier ; seule, la ville est « le repaire »', () => {
  const el = document.createElement('div')
  rendreRepaires(el, [repaire('Mâcon', 139, 104)], 'min', vi.fn(), 'moyenne')
  expect(el.textContent).toContain('Le repaire')
  expect(el.querySelector('.ligne')!.textContent).toBe('1 h 44 en moyenne · 2 h 19 au pire')
})

test('la première ville n’est jamais marquée « ça se vaut »', () => {
  const el = document.createElement('div')
  rendreRepaires(el, [repaire('Mâcon', 139, 104, true)], 'min', vi.fn())
  expect(el.querySelector('.equivalent')).toBeNull()
})
