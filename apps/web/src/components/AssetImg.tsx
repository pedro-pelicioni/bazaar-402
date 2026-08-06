import { useState } from 'react'

/**
 * An <img> that removes itself if the file is missing, so a generated asset that
 * never landed can never break a layout. Every use has a CSS-only fallback behind it.
 */
export function AssetImg({
  src,
  alt = '',
  className,
  width,
  height,
}: {
  src: string
  alt?: string
  className?: string
  width?: number
  height?: number
}) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      aria-hidden={alt ? undefined : true}
      onError={() => setOk(false)}
    />
  )
}
