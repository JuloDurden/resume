import { describe, expect, it } from 'vitest'
import { applyIdentity } from '../lib/identity'
import type { LetterDoc, ResumeDoc } from '../types'

const cv = { id: 'a', kind: 'resume', name: 'x', header: { name: 'Old', title: 'PO', photo: 'p0', contacts: [{ id: '1', kind: 'email', value: 'old@x.fr', row: 0 }, { id: '2', kind: 'other', value: 'https://a', label: 'A', row: 2 }] } } as unknown as ResumeDoc

describe('identité', () => {
  it('remplace les valeurs sans toucher à la mise en page', () => {
    const d = applyIdentity(cv, { name: 'Julien CLAVEL', email: 'j@x.fr', phone: '06', other: 'https://b', otherLabel: 'Portfolio', photo: 'p1' })
    expect(d.header.name).toBe('Julien CLAVEL')
    expect(d.header.contacts).toHaveLength(2)
    expect(d.header.contacts[0]).toMatchObject({ value: 'j@x.fr', row: 0 })
    expect(d.header.contacts[1]).toMatchObject({ value: 'https://b', label: 'Portfolio' })
    expect(d.header.photo).toBe('p1')
    expect(d.header.title).toBe('PO')
  })
  it('ne met pas de photo là où elle a été retirée, sauf nouveau document', () => {
    const noPhoto = { ...cv, header: { ...cv.header, photo: undefined } }
    expect(applyIdentity(noPhoto, { photo: 'p1' }).header.photo).toBeUndefined()
    const n = applyIdentity(noPhoto, { photo: 'p1', phone: '06' }, true)
    expect(n.header.photo).toBe('p1')
    expect(n.header.contacts.some((c) => c.kind === 'phone' && c.value === '06')).toBe(true)
  })
  it('respecte une lettre volontairement non signée', () => {
    const l = { ...cv, kind: 'letter', signatureImage: undefined } as unknown as LetterDoc
    expect(applyIdentity(l, { signature: 's' }).signatureImage).toBeUndefined()
    expect(applyIdentity({ ...l, signatureImage: 'old' }, { signature: 's' }).signatureImage).toBe('s')
  })
  it('renvoie le même objet si rien ne change', () => {
    expect(applyIdentity(cv, { email: 'old@x.fr' })).toBe(cv)
  })
})
