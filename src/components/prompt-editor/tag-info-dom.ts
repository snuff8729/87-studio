import { currentLocale, translator } from './tag-info-client'
import type { TagInfo } from '@/server/functions/tag-assist'
import {
  categoryColor,
  categoryLabel,
  danbooruColor,
  fineLabel,
  getCategoryDef,
} from '@/lib/tag-categories'
import { formatCount, tagDisplayName } from '@/lib/tag-query'

export function el<TTag extends keyof HTMLElementTagNameMap>(
  tag: TTag,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[TTag] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/** Small colored label for a fine category key. */
export function categoryBadge(fine: string, top?: string): HTMLElement {
  const locale = currentLocale()
  const def = getCategoryDef(fine)
  const text = fineLabel(fine, top ?? def?.parent ?? fine, locale)
  const badge = el('span', 'cm-tag-badge', text)
  const color = categoryColor(def?.parent ?? top ?? fine)
  badge.style.color = color
  badge.style.borderColor = `color-mix(in oklch, ${color} 40%, transparent)`
  return badge
}

/** Small "NAIA" label for descriptions that come from the NAIA2.0 data. */
export function sourceLabel(info: TagInfo): HTMLElement | null {
  if (info.descriptionSource !== 'naia') return null
  const t = translator()
  const label = el('span', 'cm-tag-source', t('tagAssist.naiaLabel'))
  label.title = t('tagAssist.naiaTitle')
  return label
}

/** Category + fine category + post count line. */
export function metaLine(info: TagInfo): HTMLElement {
  const t = translator()
  const line = el('div', 'cm-tag-meta')
  const main = el(
    'span',
    'cm-tag-badge',
    info.category === 0 ? 'general' : categoryLabel(info.top, currentLocale()),
  )
  main.style.color = danbooruColor(info.category)
  main.style.borderColor = `color-mix(in oklch, ${danbooruColor(info.category)} 40%, transparent)`
  line.append(main)
  if (info.fine !== info.top || info.category === 0) {
    line.append(categoryBadge(info.fine, info.top))
  }
  line.append(
    el(
      'span',
      'cm-tag-count',
      t('tagAssist.posts', { count: formatCount(info.postCount) }),
    ),
  )
  if (info.deprecated)
    line.append(el('span', 'cm-tag-badge', t('tagAssist.deprecated')))
  return line
}

/** Info panel shown beside the autocomplete list. */
export function buildInfoPanel(info: TagInfo): HTMLElement {
  const t = translator()
  const root = el('div', 'cm-tag-info')
  const title = el('div', 'cm-tag-info-title', tagDisplayName(info.name))
  title.style.color = danbooruColor(info.category)
  root.append(title, metaLine(info))
  const desc = el(
    'div',
    info.description ? 'cm-tag-desc' : 'cm-tag-desc cm-tag-muted',
    info.description ?? t('tagAssist.noDescription'),
  )
  const source = sourceLabel(info)
  if (source) desc.append(source)
  root.append(desc)
  const lists: Array<[string, Array<string>]> = [
    [t('tagAssist.aliases'), info.aliases.slice(0, 4)],
    [t('tagAssist.implies'), info.implies.slice(0, 4)],
  ]
  for (const [label, names] of lists) {
    if (names.length === 0) continue
    const row = el('div', 'cm-tag-info-row')
    row.append(
      el('span', 'cm-tag-muted', label + ' '),
      el('span', undefined, names.map(tagDisplayName).join(', ')),
    )
    root.append(row)
  }
  return root
}
