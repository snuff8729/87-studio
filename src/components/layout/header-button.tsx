import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Button for the app header actions area: one compact size (h-8, 13px text,
 * size-4 icons) shared by every page.
 */
export function HeaderButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn('h-8 px-2.5 text-[13px] [&_svg]:size-4', className)}
      {...props}
    />
  )
}
