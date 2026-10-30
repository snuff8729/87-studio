import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy scene-detail URL. The scene view now lives in the workspace
 * (`/workspace/$projectId?scene=$sceneId`); keep old links working.
 */
export const Route = createFileRoute('/workspace/$projectId/scenes/$sceneId')({
  beforeLoad: ({ params, search }) => {
    const imageSort = (search as Record<string, unknown>).imageSort
    throw redirect({
      to: '/workspace/$projectId',
      params: { projectId: params.projectId },
      search: {
        scene: Number(params.sceneId),
        imageSort:
          imageSort === 'tournament_winrate' || imageSort === 'tournament_wins'
            ? imageSort
            : undefined,
        imageDetail: undefined,
      },
      replace: true,
    })
  },
})
