import { afterEach, expect, test, vi } from 'vitest'
import { creerHoraires, decoderLigne, decoderVoisins } from '../../src/donnees/horaires'

afterEach(() => vi.unstubAllGlobals())

function ligneBinaire(entrees: [number, number, number][]): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(entrees.length * 5))
  entrees.forEach(([m, k, f], j) => {
    v.setUint16(j * 5, m, true)
    v.setUint16(j * 5 + 2, k, true)
    v.setUint8(j * 5 + 4, f)
  })
  return v.buffer
}

test('decoderLigne lit minutes, km et grande ligne', () => {
  const l = decoderLigne(ligneBinaire([[0, 0, 0], [194, 750, 1]]))
  expect(Array.from(l.minutes)).toEqual([0, 194])
  expect(Array.from(l.km)).toEqual([0, 750])
  expect(Array.from(l.grandeLigne)).toEqual([0, 1])
})

test('decoderLigne refuse une taille incohérente', () => {
  expect(() => decoderLigne(new ArrayBuffer(7))).toThrow('horaires')
})

test('decoderVoisins lit gares et distances', () => {
  const v = new DataView(new ArrayBuffer(12))
  v.setUint16(0, 5, true)
  v.setUint16(2, 12, true)
  const d = decoderVoisins(v.buffer)
  expect(d.gares[0]).toBe(5)
  expect(d.hectometres[0]).toBe(12)
})

test('les lignes sont chargées une seule fois', async () => {
  const f = vi.fn(async (url: string) => {
    if (url.endsWith('stations.json')) return new Response(JSON.stringify([{ nom: 'A', lat: 45, lon: 4, desservie: true }]))
    if (url.endsWith('voisins-4km.bin')) return new Response(new ArrayBuffer(12))
    return new Response(ligneBinaire([[0, 0, 0]]))
  })
  vi.stubGlobal('fetch', f)
  const h = await creerHoraires()
  await Promise.all([h.lignes([0]), h.lignes([0])])
  expect(f.mock.calls.filter(([u]) => String(u).endsWith('lignes/0.bin'))).toHaveLength(1)
  expect(h.ligne(0)?.minutes[0]).toBe(0)
})

test('horaires absents : erreur claire', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  await expect(creerHoraires()).rejects.toThrow('Horaires des trains indisponibles')
})
