import { expect, test } from 'vitest'
import type { Tranche } from '../../src/calcul/zones'
import { rendreLegende } from '../../src/ui/legende'

const tranche = (seuil: number, couleur: string): Tranche => ({ seuil, couleur, coordonnees: [] })

test('les tranches sont affichées dans l’ordre croissant avec un libellé accessible', () => {
  const el = document.createElement('div')
  el.hidden = true
  rendreLegende(el, [tranche(300, '#ccc'), tranche(100, '#0b5d2a'), tranche(200, '#999')])
  const cases = [...el.querySelectorAll('.case')]
  expect(cases.map((c) => c.textContent)).toEqual(['100', '200', '300'])
  expect(el.querySelector('.unite')!.textContent).toBe('km')
  expect(el.hidden).toBe(false)
  expect(el.getAttribute('role')).toBe('img')
  expect(el.getAttribute('aria-label')).toContain('jusqu’à 100 km')
})

test('une liste vide cache la légende', () => {
  const el = document.createElement('div')
  rendreLegende(el, [])
  expect(el.hidden).toBe(true)
  expect(el.innerHTML).toBe('')
})

test('en minutes, chaque case porte sa valeur et il n’y a pas d’unité finale', () => {
  const el = document.createElement('div')
  rendreLegende(el, [tranche(60, '#ccc'), tranche(120, '#999')], 'min')
  const cases = [...el.querySelectorAll('.case')]
  expect(cases.map((c) => c.textContent)).toEqual(['1 h', '2 h'])
  expect(el.querySelector('.unite')).toBeNull()
})
