import { describe, expect, it } from 'vitest'
import { stripDTextInline, wikiSummary } from '../dtext'

describe('stripDTextInline', () => {
  it('keeps link labels', () => {
    expect(stripDTextInline('a [[long hair|Long]] and [[short hair]]')).toBe(
      'a Long and short hair',
    )
    expect(stripDTextInline('see "this":https://example.com now')).toBe(
      'see this now',
    )
    expect(stripDTextInline('[[Tag group:Face tags]]')).toBe('Face tags')
  })

  it('removes inline tags and post refs', () => {
    expect(stripDTextInline('[b]bold[/b] [i]it[/i] !post #123')).toBe('bold it')
    expect(stripDTextInline('{{smile order:count}} tag')).toBe(
      'smile order:count tag',
    )
  })
})

describe('wikiSummary', () => {
  it('takes the first paragraphs before the first header', () => {
    const body =
      'An expression showing [[happy|happiness]].\r\n\r\nIf the mouth is open it may be a [[grin]].\r\n\r\nh4. Examples\r\n\r\n* !post #1\r\n\r\nh4. Related tags\r\n\r\n* [[^_^]]'
    expect(wikiSummary(body)).toBe(
      'An expression showing happiness.\n\nIf the mouth is open it may be a grin.',
    )
  })

  it('skips list-only and header-only bodies', () => {
    expect(wikiSummary('h4. See also\r\n\r\n* [[a]]\r\n* [[b]]')).toBeNull()
    expect(wikiSummary('')).toBeNull()
    expect(wikiSummary(null)).toBeNull()
  })

  it('cuts at a sentence boundary when too long', () => {
    const body = 'First sentence is here. ' + 'word '.repeat(100)
    const s = wikiSummary(body, 60)
    expect(s && s.length <= 61).toBe(true)
  })

  it('accepts headers without a space after the dot', () => {
    expect(wikiSummary('A skirt.\n\nh4.See also\n\n* [[x]]')).toBe('A skirt.')
  })

  it('stops a paragraph at a glued header', () => {
    expect(wikiSummary('Some text.\nh4. Types\n* a')).toBe('Some text.')
  })
})
