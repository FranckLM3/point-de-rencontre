import { expect, test } from 'vitest'
import { pictoTransport } from '../../src/ui/icones'

test('picto voiture : icône décorative et texte visuellement masqué pour les lecteurs d’écran', () => {
  const el = document.createElement('div')
  el.innerHTML = pictoTransport('voiture')
  const svg = el.querySelector('svg')!
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(el.querySelector('.invisible')!.textContent).toBe('voiture')
  expect(el.textContent).toBe('voiture')
})

test('picto transports : une icône de train, différente de la voiture', () => {
  const voiture = document.createElement('div')
  voiture.innerHTML = pictoTransport('voiture')
  const transports = document.createElement('div')
  transports.innerHTML = pictoTransport('tc')
  expect(transports.querySelector('.invisible')!.textContent).toBe('transports')
  expect(transports.querySelector('svg')!.outerHTML).not.toBe(voiture.querySelector('svg')!.outerHTML)
})

test('aucun émoji dans les pictogrammes', () => {
  const el = document.createElement('div')
  el.innerHTML = pictoTransport('voiture') + pictoTransport('tc')
  // Grossière mais suffisante : les émojis sortent du plan de base multilingue (> U+FFFF).
  expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(el.innerHTML)).toBe(false)
})
