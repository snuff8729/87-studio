import { createFileRoute } from '@tanstack/react-router'

// Gallery grid is rendered by the layout route (route.tsx).
// This index route renders nothing — it just exists so /gallery/ is a valid path.
export const Route = createFileRoute('/gallery/')({
  component: () => null,
})
