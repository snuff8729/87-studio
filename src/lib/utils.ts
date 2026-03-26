import { useRef } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ClassValue } from 'clsx'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

export function useStableArray<T>(arr: Array<T>): Array<T> {
  const ref = useRef(arr)
  if (
    arr.length !== ref.current.length ||
    arr.some((item, i) => item !== ref.current[i])
  ) {
    ref.current = arr
  }
  return ref.current
}
