import { expect, test, vi } from 'vitest'
import { chercherAdresses } from '../../src/donnees/geocodage'

const reponse = {
  type: 'FeatureCollection',
  features: [{ geometry: { coordinates: [2.36041, 48.8555] }, properties: { label: '10 Rue de Rivoli 75004 Paris' } }],
}

test('convertit la réponse IGN', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => reponse })
  const r = await chercherAdresses('10 rue de rivoli', f)
  expect(r).toEqual([{ label: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041 }])
  expect(f.mock.calls[0]![0]).toContain('q=10+rue+de+rivoli')
})

test('moins de 3 caractères : aucun appel', async () => {
  const f = vi.fn()
  expect(await chercherAdresses('ab', f)).toEqual([])
  expect(f).not.toHaveBeenCalled()
})

test('erreur HTTP : message clair', async () => {
  const f = vi.fn().mockResolvedValue({ ok: false, status: 503 })
  await expect(chercherAdresses('paris', f)).rejects.toThrow('recherche d’adresse')
})
