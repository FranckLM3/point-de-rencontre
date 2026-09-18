import { afterEach, expect, test, vi } from 'vitest'
import { creerHoraires, decoderLigne, decoderVoisins } from '../../src/donnees/horaires'

afterEach(() => vi.unstubAllGlobals())

function ligneBinaire(entrees: [number, number, number, number?][]): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(entrees.length * 7))
  entrees.forEach(([m, k, f, p = 65535], j) => {
    v.setUint16(j * 7, m, true)
    v.setUint16(j * 7 + 2, k, true)
    v.setUint8(j * 7 + 4, f)
    v.setUint16(j * 7 + 5, p, true)
  })
  return v.buffer
}

test('decoderLigne lit minutes, km et grande ligne', () => {
  const l = decoderLigne(ligneBinaire([[0, 0, 0], [194, 750, 1]]))
  expect(Array.from(l.minutes)).toEqual([0, 194])
  expect(Array.from(l.km)).toEqual([0, 750])
  expect(Array.from(l.grandeLigne)).toEqual([0, 1])
})

test('decoderLigne lit le nombre de correspondances dans les bits 1 à 4', () => {
  // 0b0000_0011 = grande ligne + 1 correspondance ; 0b0001_1110 = 15 correspondances, pas de grande ligne.
  const l = decoderLigne(ligneBinaire([[194, 750, 0b0000_0011], [360, 900, 0b0001_1110]]))
  expect(Array.from(l.grandeLigne)).toEqual([1, 0])
  expect(Array.from(l.correspondances)).toEqual([1, 15])
})

test('decoderLigne lit la gare précédente', () => {
  const l = decoderLigne(ligneBinaire([[0, 0, 0, 65535], [60, 10, 0, 2]]))
  expect(Array.from(l.precedente)).toEqual([65535, 2])
})

test('decoderLigne refuse une taille incohérente', () => {
  expect(() => decoderLigne(new ArrayBuffer(10))).toThrow('horaires')
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
