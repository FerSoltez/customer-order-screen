"use client"

import { useEffect, useState } from "react"
import { Rect, StaticCanvas } from "fabric"
import * as THREE from "three"

type UVRegion = { x: number; y: number; w: number; h: number }

const UV_REGIONS: Record<string, UVRegion> = {
  frente: { x: 0.0, y: 0.1172, w: 0.5, h: 0.6527 },
  espalda: { x: 0.5, y: 0.1172, w: 0.45, h: 0.7227 },
  manga_izquierda: { x: 0.0, y: 0.8008, w: 0.55, h: 0.15 },
  manga_derecha: { x: 0.5, y: 0.8008, w: 0.4, h: 0.1592 },
}

interface UseStripedDesignTextureOptions {
  color1: string
  color2: string
  stripeCount?: number
  resolution?: number
  enabled?: boolean
}

export function useStripedDesignTexture({
  color1,
  color2,
  stripeCount = 5,
  resolution = 1024,
  enabled = true,
}: UseStripedDesignTextureOptions): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)

  useEffect(() => {
    if (!enabled) {
      setTexture((prev) => {
        prev?.dispose()
        return null
      })
      return
    }

    const safeResolution = Math.max(128, Math.floor(resolution))
    const safeStripeCount = Math.max(1, Math.floor(stripeCount))

    const memoryCanvas = document.createElement("canvas")
    memoryCanvas.width = safeResolution
    memoryCanvas.height = safeResolution

    const fabricCanvas = new StaticCanvas(memoryCanvas, {
      renderOnAddRemove: false,
      enableRetinaScaling: false,
      backgroundColor: "transparent",
    })

    Object.values(UV_REGIONS).forEach((region) => {
      // UV values are normalized [0..1], so pixel = normalized * textureResolution.
      const px = region.x * safeResolution
      const py = region.y * safeResolution
      const pw = region.w * safeResolution
      const ph = region.h * safeResolution

      // Each stripe gets an equal vertical slice of the region height.
      const stripeHeight = ph / safeStripeCount

      const regionClip = new Rect({
        left: px,
        top: py,
        width: pw,
        height: ph,
        absolutePositioned: true,
      })

      for (let i = 0; i < safeStripeCount; i++) {
        const top = py + stripeHeight * i
        const nextTop = i === safeStripeCount - 1 ? py + ph : py + stripeHeight * (i + 1)
        const height = Math.max(0, nextTop - top)

        const stripe = new Rect({
          left: px,
          top,
          width: pw,
          height,
          fill: i % 2 === 0 ? color1 : color2,
          selectable: false,
          evented: false,
          objectCaching: false,
          clipPath: regionClip,
        })

        fabricCanvas.add(stripe)
      }
    })

    fabricCanvas.requestRenderAll()

    const generatedTexture = new THREE.CanvasTexture(memoryCanvas)
    generatedTexture.colorSpace = THREE.SRGBColorSpace
    generatedTexture.needsUpdate = true

    setTexture((prev) => {
      prev?.dispose()
      return generatedTexture
    })

    return () => {
      fabricCanvas.dispose()
      generatedTexture.dispose()
    }
  }, [color1, color2, enabled, resolution, stripeCount])

  return texture
}
