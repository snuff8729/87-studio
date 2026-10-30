import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePageHeader } from '@/components/layout/breadcrumb-context'
import { listTagBookmarks } from '@/server/functions/tag-bookmarks'
import { TagGalleryContent } from '@/components/tag-gallery/tag-gallery-content'

export const Route = createFileRoute('/tags/')({
  component: TagGalleryPage,
  loader: () => listTagBookmarks({ data: {} }),
  validateSearch: (search: Record<string, unknown>) => ({
    tag: (search.tag as string) || undefined,
  }),
})

function TagGalleryPage() {
  const { tag: urlTag } = Route.useSearch()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [selectedTag, setSelectedTag] = useState<string | null>(urlTag ?? null)
  const [count, setCount] = useState<number | null>(null)

  usePageHeader({ count })

  function handleSelectTag(tag: string | null) {
    setSelectedTag(tag)
    navigate({
      to: '/tags',
      search: { tag: tag ?? undefined, imageDetail: undefined },
      // Opening a detail from the mobile list is a real step: phone Back
      // returns to the list. Everything else replaces.
      replace: !(isMobile && tag !== null && selectedTag === null),
    })
  }

  // Follow the URL (phone Back / forward)
  useEffect(() => {
    setSelectedTag(urlTag ?? null)
  }, [urlTag])

  return (
    <TagGalleryContent
      selectedTag={selectedTag}
      onSelectTag={handleSelectTag}
      onCountChange={setCount}
    />
  )
}
