import { expect, test } from 'vitest'
import { enTetesCors, ORIGINES_AUTORISEES } from '../../supabase/functions/voiture/cors'

test('le site publié est autorisé et renvoyé tel quel', () => {
  const h = enTetesCors('https://francklm3.github.io')
  expect(h['Access-Control-Allow-Origin']).toBe('https://francklm3.github.io')
  expect(h['Access-Control-Allow-Methods']).toContain('OPTIONS')
  expect(h['Access-Control-Allow-Headers']).toContain('authorization')
  expect(h['Access-Control-Allow-Headers']).toContain('apikey')
  expect(h['Access-Control-Allow-Headers']).toContain('x-client-info')
})

test('le serveur local de développement est autorisé', () => {
  expect(enTetesCors('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
})

test('une origine inconnue ne reçoit pas son propre nom', () => {
  expect(enTetesCors('https://exemple.com')['Access-Control-Allow-Origin']).toBe(ORIGINES_AUTORISEES[0])
  expect(enTetesCors(null)['Access-Control-Allow-Origin']).toBe(ORIGINES_AUTORISEES[0])
})
