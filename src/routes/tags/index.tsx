import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { useTranslation } from '@/lib/i18n'
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
  const { t } = useTranslation()

  const [selectedTag, setSelectedTag] = useState<string | null>(urlTag ?? null)

  function handleSelectTag(tag: string | null) {
    setSelectedTag(tag)
    navigate({
      to: '/tags',
      search: tag ? { tag } : {},
      replace: true,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('tagGallery.title')}
        description={t('tagGallery.description')}
      />
      <TagGalleryContent
        selectedTag={selectedTag}
        onSelectTag={handleSelectTag}
      />
    </div>
  )
}
