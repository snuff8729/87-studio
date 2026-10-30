import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy scene-detail URL. The scene view now lives in the workspace
 * (`/workspace/$projectId?scene=$sceneId`); keep old links working.
 */
export const Route = createFileRoute('/workspace/$projectId/scenes/$sceneId')({
  beforeLoad: ({ params, search }) => {
    const { imageSort, imageDetail } = search as Record<string, unknown>
    const imageDetailId = Number(imageDetail)
    throw redirect({
      to: '/workspace/$projectId',
      params: { projectId: params.projectId },
      search: {
        scene: Number(params.sceneId),
        imageSort:
          imageSort === 'tournament_winrate' || imageSort === 'tournament_wins'
            ? imageSort
            : undefined,
        // Keep an open image overlay (`?imageDetail=`) across the redirect
        imageDetail:
          Number.isInteger(imageDetailId) && imageDetailId > 0
            ? imageDetailId
            : undefined,
      },
      replace: true,
    })
  },
})
