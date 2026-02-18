const PADDING = 8
const BORDER_RADIUS = 8

function buildClipPath(rect: DOMRect): string {
  const x = rect.left - PADDING
  const y = rect.top - PADDING
  const w = rect.width + PADDING * 2
  const h = rect.height + PADDING * 2

  // Evenodd polygon: outer rectangle (full viewport) then inner rectangle (hole)
  // Wound in opposite directions to create the hole via evenodd rule
  return `polygon(
    evenodd,
    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
    ${x}px ${y}px,
    ${x}px ${y + h}px,
    ${x + w}px ${y + h}px,
    ${x + w}px ${y}px,
    ${x}px ${y}px
  )`
}

interface SpotlightBackdropProps {
  targetRect: DOMRect | null
}

export function SpotlightBackdrop({ targetRect }: SpotlightBackdropProps) {
  const clipPath = targetRect ? buildClipPath(targetRect) : undefined

  return (
    <>
      {/* Dark overlay with clip-path hole */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70"
        style={{
          clipPath,
          transition: 'clip-path 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none',
        }}
      />

      {/* Glow ring around the hole */}
      {targetRect && (
        <div
          className="pointer-events-none fixed z-[9998] rounded-lg ring-2 ring-primary"
          style={{
            left: targetRect.left - PADDING,
            top: targetRect.top - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
            borderRadius: BORDER_RADIUS,
            boxShadow: '0 0 0 3px hsl(var(--primary) / 0.4), 0 0 24px 8px hsl(var(--primary) / 0.25), 0 0 48px 12px hsl(var(--primary) / 0.1)',
            transition:
              'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}
    </>
  )
}
