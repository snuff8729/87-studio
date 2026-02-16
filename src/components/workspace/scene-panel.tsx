import { SceneList } from './scene-list'
import { SceneDetail } from './scene-detail'

interface ScenePanelProps {
  scenePacks: Array<{
    id: number
    name: string
    scenes: Array<{
      id: number
      name: string
      placeholders: string | null
      sortOrder: number | null
      recentImageCount: number
      thumbnailPath: string | null
      thumbnailImageId: number | null
    }>
  }>
  selectedSceneId: number | null
  onSelectScene: (id: number | null) => void
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }>
  generalPrompt: string
  projectId: number
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  onThumbnailChange: (sceneId: number, imageId: number | null, thumbnailPath?: string | null) => void
  refreshKey?: number
}

export function ScenePanel({
  scenePacks,
  selectedSceneId,
  onSelectScene,
  characters,
  generalPrompt,
  projectId,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  onThumbnailChange,
  refreshKey,
}: ScenePanelProps) {
  if (selectedSceneId !== null) {
    // Find the scene info
    const sceneInfo = scenePacks
      .flatMap((pack) => pack.scenes.map((s) => ({ ...s, packName: pack.name })))
      .find((s) => s.id === selectedSceneId)

    if (!sceneInfo) {
      onSelectScene(null)
      return null
    }

    return (
      <SceneDetail
        sceneId={selectedSceneId}
        sceneName={sceneInfo.name}
        packName={sceneInfo.packName}
        characters={characters}
        generalPrompt={generalPrompt}
        projectId={projectId}
        onBack={() => onSelectScene(null)}
        count={sceneCounts[selectedSceneId] ?? null}
        defaultCount={defaultCount}
        onCountChange={(count) => onSceneCountChange(selectedSceneId, count)}
        thumbnailImageId={sceneInfo.thumbnailImageId}
        onThumbnailChange={(imageId, thumbPath) => onThumbnailChange(selectedSceneId, imageId, thumbPath)}
        refreshKey={refreshKey}
      />
    )
  }

  return (
    <SceneList
      scenePacks={scenePacks}
      onSelectScene={onSelectScene}
      sceneCounts={sceneCounts}
      defaultCount={defaultCount}
      onSceneCountChange={onSceneCountChange}
    />
  )
}
