import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
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

  const [selectedTag, setSelectedTag] = useState<string | null>(urlTag ?? null)
  const [count, setCount] = useState<number | null>(null)

  usePageHeader({ count })

  function handleSelectTag(tag: string | null) {
    setSelectedTag(tag)
    navigate({
      to: '/tags',
      search: tag ? { tag } : {},
      replace: true,
    })
  }

  return (
    <TagGalleryContent
      selectedTag={selectedTag}
      onSelectTag={handleSelectTag}
      onCountChange={setCount}
    />
  )
}
