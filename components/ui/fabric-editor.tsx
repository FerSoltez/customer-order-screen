"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { Undo2, Redo2 } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import type { TemplateView } from "./template-selector"

// Image/text placement zones per template view (relative coords 0-1).
// These are independent from the 3D UV regions in app/personalizador/page.tsx.
// To adjust a zone: x = left edge, y = top edge, w = width, h = height (all 0-1)
const imagePlacementZones: Record<string, { x: number; y: number; w: number; h: number }[]> = {
  frente: [
    { x: 0.20, y: 0.22, w: 0.22, h: 0.10 },   // Pecho Derecho (top-left)
    { x: 0.56, y: 0.22, w: 0.22, h: 0.10 },   // Escudo Pecho Izquierdo (top-right)
    { x: 0.26, y: 0.37, w: 0.46, h: 0.12 },   // Centro
    { x: 0.34, y: 0.54, w: 0.30, h: 0.08 },   // Zona 5 (below center)
  ],
  espalda: [
    { x: 0.32, y: 0.14, w: 0.40, h: 0.08 },   // Zona 6 - Nombre (top)
    { x: 0.32, y: 0.55, w: 0.40, h: 0.08 },   // Zona 7 - Número (center)
  ],
  manga_izquierda: [
    { x: 0.18, y: 0.40, w: 0.64, h: 0.25 },
  ],
  manga_derecha: [
    { x: 0.18, y: 0.40, w: 0.64, h: 0.25 },
  ],
}

// 3D export clipping zones per view (relative coords 0-1).
// Edit these values to change where canvas content appears on the 3D model
// without moving the visible rectangles in the mold editor.
const modelExportZones: Record<string, { x: number; y: number; w: number; h: number }[]> = {
  frente: [
    { x: 0.29, y: 0.22, w: 0.16, h: 0.08 },
    { x: 0.58, y: 0.22, w: 0.16, h: 0.08 },
    { x: 0.36, y: 0.33, w: 0.28, h: 0.08 },
    { x: 0.34, y: 0.50, w: 0.32, h: 0.08 },
  ],
  espalda: [
    { x: 0.32, y: 0.14, w: 0.40, h: 0.08 },
    { x: 0.32, y: 0.55, w: 0.40, h: 0.08 },
  ],
  manga_izquierda: [
    { x: 0.18, y: 0.40, w: 0.64, h: 0.25 },
  ],
  manga_derecha: [
    { x: 0.18, y: 0.40, w: 0.64, h: 0.25 },
  ],
}

const templateImages: Record<string, string> = {
  frente: "/images/frente.png",
  espalda: "/images/espalda.png",
  manga_izquierda: "/images/mangas.png",
  manga_derecha: "/images/mangas.png",
}

const templateRenderConfig: Record<string, { scale: number; offsetX: number; offsetY: number }> = {
  frente: { scale: 1, offsetX: 0, offsetY: 0 },
  espalda: { scale: 1, offsetX: 0, offsetY: 0 },
  manga_izquierda: { scale: 1, offsetX: 0, offsetY: 0 },
  manga_derecha: { scale: 1, offsetX: 0, offsetY: 0 },
}

const MANGAS_INTRO_KEY = "darklion-personalizador-mangas-intro-v1"
const HISTORY_STORAGE_KEY = "darklion-personalizador-history-v1"
const FABRIC_EXPORT_TARGET_SIZE = 2048

const isCanvasImageSource = (value: unknown): value is CanvasImageSource => {
  if (!value) return false
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return true
  if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) return true
  if (typeof SVGImageElement !== "undefined" && value instanceof SVGImageElement) return true
  if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return true
  if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) return true
  if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) return true
  // VideoFrame is not available in all browsers.
  if (typeof VideoFrame !== "undefined" && value instanceof VideoFrame) return true
  return false
}

const createTransparentPng = (width: number, height: number): string | null => {
  try {
    const safeW = Math.max(1, Math.floor(width || 1))
    const safeH = Math.max(1, Math.floor(height || 1))
    const fallback = document.createElement("canvas")
    fallback.width = safeW
    fallback.height = safeH
    const fallbackCtx = fallback.getContext("2d", { alpha: true })
    fallbackCtx?.clearRect(0, 0, safeW, safeH)
    return fallback.toDataURL("image/png")
  } catch {
    return null
  }
}

interface PersistedHistoryItem {
  stack: string[]
  index: number
}

type PersistedHistoryMap = Record<string, PersistedHistoryItem>

interface FabricEditorProps {
  activeView: TemplateView
  restoreRevision?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCanvasReady?: (canvas: any) => void
  onCanvasUpdate?: (view: string, userContentDataUrl: string) => void
  initialViewObjects?: Record<string, string>
  onViewObjectsChange?: (view: string, serializedObjects: string | null) => void
  onGlobalUndo?: () => void
  onGlobalRedo?: () => void
  canGlobalUndo?: boolean
  canGlobalRedo?: boolean
  onCanvasStateChange?: () => void
}

export function FabricEditor({ activeView, restoreRevision = 0, onCanvasReady, onCanvasUpdate, initialViewObjects, onViewObjectsChange, onGlobalUndo, onGlobalRedo, canGlobalUndo = false, canGlobalRedo = false, onCanvasStateChange }: FabricEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasRef2 = useRef<HTMLCanvasElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef2 = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricModuleRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const historyRef = useRef<any[]>([])
  const historyIndexRef = useRef(-1)
  const isLoadingRef = useRef(false)
  const historyBusyRef = useRef(false)
  const initCountRef = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasInstanceMapRef = useRef<WeakMap<HTMLCanvasElement, any>>(new WeakMap())
  const savedStatesRef = useRef<Record<string, string>>(initialViewObjects ?? {})
  const currentViewRef = useRef<string>("")
  const [, setHistoryState] = useState(0)
  const [isHistoryBusy, setIsHistoryBusy] = useState(false)
  const [showMangasIntro, setShowMangasIntro] = useState(false)

  const isMangas = activeView === "mangas"
  const primaryMangaKey = "manga_derecha"
  const secondaryMangaKey = "manga_izquierda"
  const currentHistoryKey = isMangas ? primaryMangaKey : activeView

  const configureImageObject = useCallback((obj: any) => {
    if (!obj || obj.type !== "image") return
    obj.set({
      lockUniScaling: false,
      lockScalingFlip: true,
      lockSkewingX: true,
      lockSkewingY: true,
    })
    obj.setControlsVisibility?.({
      mt: true,
      mb: true,
      ml: true,
      mr: true,
      mtr: true,
      tl: true,
      tr: true,
      bl: true,
      br: true,
    })
  }, [])

  const enforceMinimumSize = useCallback((obj: any, zoneReference?: { width: number; height: number }) => {
    if (!obj) return
    const MIN_IMAGE_SIZE = 30 // pixels
    const MIN_TEXT_SIZE = 14 // font size in pixels
    const MIN_ZONE_PERCENTAGE = 0.1 // 10% of zone

    obj.setCoords()
    const bounds = obj.getBoundingRect(true, true)
    if (!bounds) return

    if (obj.type === "image") {
      let minW = MIN_IMAGE_SIZE
      let minH = MIN_IMAGE_SIZE
      if (zoneReference) {
        minW = Math.max(MIN_IMAGE_SIZE, zoneReference.width * MIN_ZONE_PERCENTAGE)
        minH = Math.max(MIN_IMAGE_SIZE, zoneReference.height * MIN_ZONE_PERCENTAGE)
      }
      let nextScaleX = obj.scaleX || 1
      let nextScaleY = obj.scaleY || 1

      if (bounds.width < minW) {
        nextScaleX = nextScaleX * (minW / Math.max(1, bounds.width))
      }
      if (bounds.height < minH) {
        nextScaleY = nextScaleY * (minH / Math.max(1, bounds.height))
      }

      if (nextScaleX !== (obj.scaleX || 1) || nextScaleY !== (obj.scaleY || 1)) {
        obj.set({ scaleX: nextScaleX, scaleY: nextScaleY })
      }
    } else if (obj.type === "i-text" || obj.type === "text") {
      const currentFontSize = obj.fontSize || 14
      if (currentFontSize < MIN_TEXT_SIZE) {
        obj.set({ fontSize: MIN_TEXT_SIZE })
      }
    }
    obj.setCoords()
  }, [])

  const saveHistorySnapshot = useCallback((key: string) => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as PersistedHistoryMap) : {}
      parsed[key] = {
        stack: [...historyRef.current],
        index: historyIndexRef.current,
      }
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(parsed))
    } catch {
      // ignore storage errors
    }
  }, [])

  const loadHistorySnapshot = useCallback((key: string): PersistedHistoryItem | null => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PersistedHistoryMap
      const item = parsed[key]
      if (!item || !Array.isArray(item.stack)) return null
      const boundedIndex = Math.max(0, Math.min(item.index ?? 0, item.stack.length - 1))
      return { stack: item.stack, index: boundedIndex }
    } catch {
      return null
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persistCanvasState = useCallback((canvas: any, saveKey: string, allowEmpty = false) => {
    if (!canvas) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userObjs = canvas.getObjects().filter((o: any) => !o._isZone)
      if (userObjs.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serialized = JSON.stringify(userObjs.map((o: any) => o.toObject()))
        savedStatesRef.current[saveKey] = serialized
        onViewObjectsChange?.(saveKey, serialized)
      } else if (allowEmpty) {
        delete savedStatesRef.current[saveKey]
        onViewObjectsChange?.(saveKey, null)
      }
    } catch {
      // ignore
    }
  }, [onViewObjectsChange])

  useEffect(() => {
    if (!initialViewObjects) return
    savedStatesRef.current = { ...initialViewObjects }
  }, [initialViewObjects])

  useEffect(() => {
    if (!isMangas) return

    try {
      const seenIntro = localStorage.getItem(MANGAS_INTRO_KEY)
      if (!seenIntro) {
        setShowMangasIntro(true)
      }
    } catch {
      setShowMangasIntro(true)
    }
  }, [isMangas])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasUserObjects = useCallback((canvas: any) => {
    if (!canvas) return false
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return canvas.getObjects().some((o: any) => !o._isZone)
    } catch {
      return false
    }
  }, [])

  // Export only user content clipped to zones (nothing outside zones appears in 3D)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportUserContent = useCallback((canvas: any, viewKey?: string): string | null => {
    if (!canvas) return null
    try {
      const cw = canvas.width
      const ch = canvas.height
      if (!cw || !ch) return null
      const exportMultiplier = Math.max(1, Math.min(4, FABRIC_EXPORT_TARGET_SIZE / Math.max(cw, ch)))
      const scaledW = Math.max(1, Math.round(cw * exportMultiplier))
      const scaledH = Math.max(1, Math.round(ch * exportMultiplier))

      // Export only user content: never include template background or zones.
      let userCanvas: CanvasImageSource | null = null
      const origBg = canvas.backgroundColor
      const origBgImage = canvas.backgroundImage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hiddenZones: any[] = []
      try {
        canvas.backgroundColor = null
        canvas.backgroundImage = null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas.getObjects().forEach((obj: any) => {
          if (obj?._isZone && obj.visible) {
            obj.visible = false
            hiddenZones.push(obj)
          }
        })

        const candidate = canvas.toCanvasElement?.(exportMultiplier, {
          withoutBackground: true,
          withoutOverlay: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: (obj: any) => !obj?._isZone,
        })
        if (isCanvasImageSource(candidate)) {
          userCanvas = candidate
        }
      } catch {
        userCanvas = null
      } finally {
        canvas.backgroundColor = origBg
        canvas.backgroundImage = origBgImage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hiddenZones.forEach((obj: any) => {
          obj.visible = true
        })
      }

      // Build clipped output for 3D:
      // - source zones come from the mold editor rectangles
      // - destination zones come from model export mapping
      const vk = viewKey || activeView
      const srcZones = imagePlacementZones[vk] || []
      const dstZones = modelExportZones[vk] || []

      // Create offscreen canvas with transparent background
      const offscreen = document.createElement("canvas")
      offscreen.width = scaledW
      offscreen.height = scaledH
      const ctx = offscreen.getContext("2d", { alpha: true, willReadFrequently: true })
      if (!ctx) {
        // Fallback: return user canvas directly if we can't clip to zones
        try {
          if (userCanvas && userCanvas instanceof HTMLCanvasElement) {
            return userCanvas.toDataURL("image/png")
          }
          return createTransparentPng(scaledW, scaledH)
        } catch {
          return createTransparentPng(scaledW, scaledH)
        }
      }

      // Clear with full transparency
      ctx.clearRect(0, 0, scaledW, scaledH)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // Draw by zone mapping (source rectangle -> destination rectangle)
      if (srcZones.length > 0 && dstZones.length > 0) {
        const zoneCount = Math.min(srcZones.length, dstZones.length)
        for (let i = 0; i < zoneCount; i++) {
          const src = srcZones[i]
          const dst = dstZones[i]
          const sx = src.x * scaledW
          const sy = src.y * scaledH
          const sw = src.w * scaledW
          const sh = src.h * scaledH
          const dx = dst.x * scaledW
          const dy = dst.y * scaledH
          const dw = dst.w * scaledW
          const dh = dst.h * scaledH
          if (!userCanvas) continue
          ctx.drawImage(userCanvas, sx, sy, sw, sh, dx, dy, dw, dh)
        }
      } else {
        // If no mapping zones, draw entire user canvas
        if (!userCanvas) {
          return createTransparentPng(scaledW, scaledH)
        }
        ctx.drawImage(userCanvas, 0, 0, scaledW, scaledH)
      }

      // Export to PNG with preserved transparency
      // Using canvas.toDataURL with proper PNG handling to avoid white background
      const pngData = offscreen.toDataURL("image/png")
      return pngData
    } catch (e) {
      console.error("exportUserContent failed:", e)
      const fallbackW = Math.max(1, Math.round((canvas?.width || 1)))
      const fallbackH = Math.max(1, Math.round((canvas?.height || 1)))
      return createTransparentPng(fallbackW, fallbackH)
    }
  }, [activeView])

  const notifyUpdate = useCallback((forceClear = false) => {
    if (!onCanvasUpdate) return
    if (isMangas) {
      if (hasUserObjects(fabricRef.current) || forceClear) {
        const d1 = exportUserContent(fabricRef.current, primaryMangaKey)
        if (d1) onCanvasUpdate(primaryMangaKey, d1)
      }
      if (hasUserObjects(fabricRef2.current) || forceClear) {
        const d2 = exportUserContent(fabricRef2.current, secondaryMangaKey)
        if (d2) onCanvasUpdate(secondaryMangaKey, d2)
      }
    } else {
      if (hasUserObjects(fabricRef.current) || forceClear) {
        const d = exportUserContent(fabricRef.current, activeView)
        if (d) onCanvasUpdate(activeView, d)
      }
    }
  }, [onCanvasUpdate, isMangas, activeView, exportUserContent, hasUserObjects])

  useEffect(() => {
    if (!fabricModuleRef.current || isLoadingRef.current) return

    const restore = async () => {
      isLoadingRef.current = true
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restoreForCanvas = async (targetCanvas: any, stateKey: string) => {
          if (!targetCanvas) return

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toRemove = targetCanvas.getObjects().filter((o: any) => !o._isZone)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toRemove.forEach((o: any) => targetCanvas.remove(o))

          const saved = savedStatesRef.current[stateKey]
          if (saved) {
            const objsData = JSON.parse(saved)
            if (Array.isArray(objsData) && objsData.length > 0) {
              const restored = await fabricModuleRef.current.util.enlivenObjects(objsData)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              restored.forEach((obj: any) => {
                configureImageObject(obj)
                enforceMinimumSize(obj)
                obj._autoFitted = true
                targetCanvas.add(obj)
              })
            }
          }

          targetCanvas.renderAll()
        }

        if (isMangas) {
          await restoreForCanvas(fabricRef.current, primaryMangaKey)
          await restoreForCanvas(fabricRef2.current, secondaryMangaKey)
        } else {
          await restoreForCanvas(fabricRef.current, activeView)
        }
      } catch {
        // ignore restore errors
      } finally {
        isLoadingRef.current = false
        notifyUpdate(true)
      }
    }

    void restore()
  }, [activeView, isMangas, notifyUpdate, primaryMangaKey, restoreRevision, secondaryMangaKey])

  const saveToHistory = useCallback(() => {
    if (!fabricRef.current || isLoadingRef.current) return
    try {
      // Save only user objects (not zones/background) so undo/redo never affects the template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userObjs = fabricRef.current.getObjects().filter((o: any) => !o._isZone)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = JSON.stringify(userObjs.map((o: any) => o.toObject()))
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
      historyRef.current.push(json)
      historyIndexRef.current = historyRef.current.length - 1
      saveHistorySnapshot(currentHistoryKey)
      setHistoryState((s) => s + 1)
    } catch {
      // ignore
    }
  }, [currentHistoryKey, saveHistorySnapshot])

  const initSingleCanvas = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (canvasEl: HTMLCanvasElement, viewKey: string, canvasWidth: number, canvasHeight: number, currentInit: number, cropHalf?: "top" | "bottom"): Promise<any> => {
      if (!fabricModuleRef.current) {
        fabricModuleRef.current = await import("fabric")
      }
      if (currentInit !== initCountRef.current) return null

      const fabric = fabricModuleRef.current

      const previousCanvas = canvasInstanceMapRef.current.get(canvasEl)
      if (previousCanvas) {
        try {
          if (previousCanvas.__keyHandler) document.removeEventListener("keydown", previousCanvas.__keyHandler)
          previousCanvas.dispose()
        } catch { /* ignore */ }
        canvasInstanceMapRef.current.delete(canvasEl)
      }

      const canvas = new fabric.Canvas(canvasEl, {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: "rgba(0,0,0,0)",
        selection: true,
      })
      canvasInstanceMapRef.current.set(canvasEl, canvas)

      // Load template background image
      const imgUrl = templateImages[viewKey]
      const imgElement = document.createElement("img")
      imgElement.crossOrigin = "anonymous"

      const buildPreparedTemplateImage = async (
        sourceImg: HTMLImageElement,
        half?: "top" | "bottom"
      ): Promise<HTMLImageElement> => {
        const tempCanvas = document.createElement("canvas")
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true })
        if (!tempCtx) return sourceImg

        const srcW = sourceImg.naturalWidth
        const srcH = sourceImg.naturalHeight

        if (half) {
          const halfH = Math.floor(srcH / 2)
          const sy = half === "top" ? 0 : halfH
          const segmentHeight = half === "top" ? halfH : (srcH - sy)
          tempCanvas.width = srcW
          tempCanvas.height = segmentHeight
          tempCtx.drawImage(sourceImg, 0, sy, srcW, segmentHeight, 0, 0, srcW, segmentHeight)
        } else {
          tempCanvas.width = srcW
          tempCanvas.height = srcH
          tempCtx.drawImage(sourceImg, 0, 0, srcW, srcH)
        }

        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
        const { data, width, height } = imageData

        let minX = width
        let minY = height
        let maxX = -1
        let maxY = -1

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3]
            if (alpha > 8) {
              if (x < minX) minX = x
              if (y < minY) minY = y
              if (x > maxX) maxX = x
              if (y > maxY) maxY = y
            }
          }
        }

        const hasVisiblePixels = maxX >= minX && maxY >= minY
        const sourceX = hasVisiblePixels ? minX : 0
        const sourceY = hasVisiblePixels ? minY : 0
        const sourceWidth = hasVisiblePixels ? (maxX - minX + 1) : width
        const sourceHeight = hasVisiblePixels ? (maxY - minY + 1) : height

        const trimmedCanvas = document.createElement("canvas")
        const trimmedCtx = trimmedCanvas.getContext("2d")
        if (!trimmedCtx) return sourceImg

        trimmedCanvas.width = Math.max(1, sourceWidth)
        trimmedCanvas.height = Math.max(1, sourceHeight)
        trimmedCtx.drawImage(
          tempCanvas,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight
        )

        const prepared = document.createElement("img")
        prepared.crossOrigin = "anonymous"

        await new Promise<void>((resolvePrepared) => {
          prepared.onload = () => resolvePrepared()
          prepared.onerror = () => resolvePrepared()
          prepared.src = trimmedCanvas.toDataURL("image/png")
        })

        return prepared.naturalWidth > 0 && prepared.naturalHeight > 0 ? prepared : sourceImg
      }

      await new Promise<void>((resolve) => {
        imgElement.onload = async () => {
          if (currentInit !== initCountRef.current) {
            resolve()
            return
          }

          const preparedTemplate = await buildPreparedTemplateImage(imgElement, cropHalf)
          const tplW = preparedTemplate.naturalWidth || 1
          const tplH = preparedTemplate.naturalHeight || 1
          const baseContainScale = Math.min(canvasWidth / tplW, canvasHeight / tplH)
          const config = templateRenderConfig[viewKey] || { scale: 1, offsetX: 0, offsetY: 0 }
          const containScale = baseContainScale * config.scale
          const finalWidth = tplW * containScale
          const finalHeight = tplH * containScale

          const fabricImage = new fabric.FabricImage(preparedTemplate, {
            left: (canvasWidth - finalWidth) / 2 + canvasWidth * config.offsetX,
            top: (canvasHeight - finalHeight) / 2 + canvasHeight * config.offsetY,
            originX: "left",
            originY: "top",
            scaleX: containScale,
            scaleY: containScale,
            selectable: false,
            evented: false,
          })
          canvas.backgroundImage = fabricImage

          const zones = imagePlacementZones[viewKey] || []
          zones.forEach((zone: { x: number; y: number; w: number; h: number }) => {
            const rect = new fabric.Rect({
              left: zone.x * canvasWidth,
              top: zone.y * canvasHeight,
              originX: "left",
              originY: "top",
              width: zone.w * canvasWidth,
              height: zone.h * canvasHeight,
              fill: "transparent",
              stroke: "#7c3aed",
              strokeWidth: 1.5,
              selectable: false,
              evented: false,
              excludeFromExport: true,
            })
            ;(rect as any)._isZone = true
            canvas.add(rect)
          })

          canvas.renderAll()
          resolve()
        }
        imgElement.onerror = () => resolve()
        imgElement.src = imgUrl
      })

      type PixelZone = { left: number; top: number; width: number; height: number }
      const zonesPx: PixelZone[] = (imagePlacementZones[viewKey] || []).map((z) => ({
        left: z.x * canvasWidth,
        top: z.y * canvasHeight,
        width: z.w * canvasWidth,
        height: z.h * canvasHeight,
      }))

      const pickZoneForObject = (obj: any): PixelZone | null => {
        if (zonesPx.length === 0) return null
        const center = obj.getCenterPoint?.()
        if (!center) return zonesPx[0]

        for (const z of zonesPx) {
          const insideX = center.x >= z.left && center.x <= z.left + z.width
          const insideY = center.y >= z.top && center.y <= z.top + z.height
          if (insideX && insideY) return z
        }

        let best = zonesPx[0]
        let bestDist = Number.POSITIVE_INFINITY
        zonesPx.forEach((z) => {
          const zx = z.left + z.width / 2
          const zy = z.top + z.height / 2
          const d = (center.x - zx) ** 2 + (center.y - zy) ** 2
          if (d < bestDist) {
            bestDist = d
            best = z
          }
        })
        return best
      }

      const clampObjectInsideZones = (obj: any) => {
        if (!obj || obj._isZone || obj.type === "activeSelection") return
        const targetZone = pickZoneForObject(obj)
        if (!targetZone) return

        const margin = 1
        const maxW = Math.max(1, targetZone.width - margin * 2)
        const maxH = Math.max(1, targetZone.height - margin * 2)

        obj.setCoords()
        let bounds = obj.getBoundingRect(true, true)
        if (!bounds) return

        if (bounds.width > maxW || bounds.height > maxH) {
          const fit = Math.min(maxW / Math.max(1, bounds.width), maxH / Math.max(1, bounds.height))
          obj.scaleX = (obj.scaleX || 1) * fit
          obj.scaleY = (obj.scaleY || 1) * fit
          obj.setCoords()
          bounds = obj.getBoundingRect(true, true)
        }

        let dx = 0
        let dy = 0

        if (bounds.left < targetZone.left + margin) {
          dx = targetZone.left + margin - bounds.left
        } else if (bounds.left + bounds.width > targetZone.left + targetZone.width - margin) {
          dx = (targetZone.left + targetZone.width - margin) - (bounds.left + bounds.width)
        }

        if (bounds.top < targetZone.top + margin) {
          dy = targetZone.top + margin - bounds.top
        } else if (bounds.top + bounds.height > targetZone.top + targetZone.height - margin) {
          dy = (targetZone.top + targetZone.height - margin) - (bounds.top + bounds.height)
        }

        if (dx !== 0 || dy !== 0) {
          obj.left = (obj.left || 0) + dx
          obj.top = (obj.top || 0) + dy
          obj.setCoords()
        }
      }

      // Auto-fit newly added objects into the first zone
      canvas.on("object:added", (e: { target?: any }) => {
        if (isLoadingRef.current) return
        const obj = e.target
        if (!obj || obj._isZone || obj._autoFitted) return
        const zones = imagePlacementZones[viewKey] || []
        if (zones.length === 0) return
        const z = zones[0]
        const zW = z.w * canvasWidth
        const zH = z.h * canvasHeight
        // Auto-scale images to fit zone
        if (obj.type === "image") {
          configureImageObject(obj)
          const s = Math.min(zW / (obj.width || 1), zH / (obj.height || 1)) * 0.9
          obj.set({ scaleX: s, scaleY: s })
        } else {
          // For text, only downscale if larger than zone
          const objW = (obj.width || 0) * (obj.scaleX || 1)
          const objH = (obj.height || 0) * (obj.scaleY || 1)
          if (objW > zW || objH > zH) {
            const s = Math.min(zW / (obj.width || 1), zH / (obj.height || 1)) * 0.9
            obj.set({ scaleX: s, scaleY: s })
          }
        }
        const finalW = (obj.width || 0) * (obj.scaleX || 1)
        const finalH = (obj.height || 0) * (obj.scaleY || 1)
        obj.set({
          left: z.x * canvasWidth + (zW - finalW) / 2,
          top: z.y * canvasHeight + (zH - finalH) / 2,
        })
        obj._autoFitted = true
        obj.setCoords()
        enforceMinimumSize(obj, { width: zW, height: zH })
        clampObjectInsideZones(obj)
      })

      canvas.on("object:modified", (e: { target?: any }) => {
        const obj = e.target
        if (!obj || obj._isZone) return
        if (obj.type === "image") {
          configureImageObject(obj)
        }
        enforceMinimumSize(obj)
        clampObjectInsideZones(obj)
        canvas.requestRenderAll()
      })

      const pasteFromClipboard = async () => {
        if (!navigator.clipboard) return

        try {
          // Prefer image blobs when available
          if ("read" in navigator.clipboard) {
            const items = await (navigator.clipboard as Clipboard).read()
            for (const item of items) {
              const imageType = item.types.find((t) => t.startsWith("image/"))
              if (!imageType) continue

              const blob = await item.getType(imageType)
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(new Error("No se pudo leer la imagen pegada"))
                reader.readAsDataURL(blob)
              })

              const imgEl = document.createElement("img")
              imgEl.crossOrigin = "anonymous"
              await new Promise<void>((resolve) => {
                imgEl.onload = () => resolve()
                imgEl.onerror = () => resolve()
                imgEl.src = dataUrl
              })

              if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                const z = zonesPx[0]
                const maxW = z ? z.width * 0.85 : canvasWidth * 0.4
                const maxH = z ? z.height * 0.85 : canvasHeight * 0.4
                const scale = Math.min(maxW / imgEl.naturalWidth, maxH / imgEl.naturalHeight, 1)

                const imageObj = new fabric.FabricImage(imgEl, {
                  left: z ? z.left + z.width / 2 : canvasWidth / 2,
                  top: z ? z.top + z.height / 2 : canvasHeight / 2,
                  originX: "center",
                  originY: "center",
                  scaleX: scale,
                  scaleY: scale,
                })
                configureImageObject(imageObj)
                canvas.add(imageObj)
                canvas.setActiveObject(imageObj)
                clampObjectInsideZones(imageObj)
                canvas.requestRenderAll()
                return
              }
            }
          }
        } catch {
          // Keep going and try text fallback
        }

        try {
          const text = await navigator.clipboard.readText()
          if (!text?.trim()) return
          const txt = new fabric.IText(text.trim(), {
            left: canvasWidth / 2,
            top: canvasHeight / 2,
            originX: "center",
            originY: "center",
            fontSize: 28,
            fill: "#1a1a2e",
            fontFamily: "Inter, sans-serif",
          })
          canvas.add(txt)
          canvas.setActiveObject(txt)
          clampObjectInsideZones(txt)
          canvas.requestRenderAll()
        } catch {
          // ignore clipboard read errors
        }
      }

      // Delete selected object with Delete/Backspace
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null
        const isTypingTarget = !!target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )

        if (!isTypingTarget && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
          e.preventDefault()
          void pasteFromClipboard()
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const active = canvas.getActiveObject() as any
        if (!active) return
        if (active.isEditing) return
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault()
          canvas.remove(active)
          canvas.discardActiveObject()
          canvas.renderAll()
        }
      }
      document.addEventListener("keydown", handleKeyDown)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(canvas as any).__keyHandler = handleKeyDown

      return canvas
    },
    []
  )

  const initCanvas = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current) return

    const currentInit = ++initCountRef.current
    isLoadingRef.current = true

    // Save state of current view before disposing
    if (currentViewRef.current) {
      const prevIsMangas = currentViewRef.current === "mangas"
      if (fabricRef.current) {
        const saveKey = prevIsMangas ? primaryMangaKey : currentViewRef.current
        persistCanvasState(fabricRef.current, saveKey)
      }
      if (fabricRef2.current && prevIsMangas) {
        persistCanvasState(fabricRef2.current, secondaryMangaKey)
      }
    }

    // Dispose previous canvases
    if (fabricRef.current) {
      try {
        if (fabricRef.current.__keyHandler) document.removeEventListener("keydown", fabricRef.current.__keyHandler)
        fabricRef.current.dispose()
      } catch { /* ignore */ }
      fabricRef.current = null
    }
    if (canvasRef.current) {
      canvasInstanceMapRef.current.delete(canvasRef.current)
    }
    if (fabricRef2.current) {
      try {
        if (fabricRef2.current.__keyHandler) document.removeEventListener("keydown", fabricRef2.current.__keyHandler)
        fabricRef2.current.dispose()
      } catch { /* ignore */ }
      fabricRef2.current = null
    }
    if (canvasRef2.current) {
      canvasInstanceMapRef.current.delete(canvasRef2.current)
    }

    // Measure from the sizer element which is not affected by canvas content
    const sizer = sizerRef.current
    if (!sizer) return
    const containerWidth = sizer.clientWidth
    const containerHeight = sizer.clientHeight

    if (isMangas) {
      // Two canvases stacked vertically for mangas
      // Each manga canvas should fit half the container height with proper proportions
      const availableHeight = containerHeight - 32 // padding
      const halfHeight = Math.floor(availableHeight / 2) - 8 // gap
      const mangaAspect = 1.3 // sleeves are slightly wider than tall
      let singleHeight = Math.max(halfHeight, 120)
      let finalWidth = singleHeight * mangaAspect
      // Don't exceed container width
      if (finalWidth > containerWidth - 16) {
        finalWidth = containerWidth - 16
        singleHeight = finalWidth / mangaAspect
      }

      const c1 = await initSingleCanvas(canvasRef.current, primaryMangaKey, finalWidth, singleHeight, currentInit, "top")
      if (!c1 || currentInit !== initCountRef.current) return

      fabricRef.current = c1

      if (canvasRef2.current) {
        const c2 = await initSingleCanvas(canvasRef2.current, secondaryMangaKey, finalWidth, singleHeight, currentInit, "bottom")
        if (!c2 || currentInit !== initCountRef.current) return
        fabricRef2.current = c2
      }
    } else {
      // Single canvas for frente/espalda - large
      const aspect = 0.65
      let canvasWidth = Math.min(containerWidth - 16, 1200)
      let canvasHeight = canvasWidth / aspect

      if (canvasHeight > containerHeight - 16) {
        canvasHeight = containerHeight - 16
        canvasWidth = canvasHeight * aspect
      }

      canvasWidth = Math.max(canvasWidth, 200)
      canvasHeight = Math.max(canvasHeight, 280)

      const c = await initSingleCanvas(canvasRef.current, activeView, canvasWidth, canvasHeight, currentInit)
      if (!c || currentInit !== initCountRef.current) return
      fabricRef.current = c
    }

    // Restore saved user objects
    currentViewRef.current = isMangas ? "mangas" : activeView
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restoreUserObjects = async (cvs: any, viewKey: string) => {
      const saved = savedStatesRef.current[viewKey]
      if (!saved || !fabricModuleRef.current) return
      try {
        const objsData = JSON.parse(saved)
        if (objsData.length > 0) {
          const restored = await fabricModuleRef.current.util.enlivenObjects(objsData)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          restored.forEach((obj: any) => {
            obj._autoFitted = true
            cvs.add(obj)
          })
          cvs.renderAll()
        }
      } catch { /* ignore */ }
    }
    if (isMangas) {
      if (fabricRef.current) await restoreUserObjects(fabricRef.current, primaryMangaKey)
      if (fabricRef2.current) await restoreUserObjects(fabricRef2.current, secondaryMangaKey)
    } else {
      if (fabricRef.current) await restoreUserObjects(fabricRef.current, activeView)
    }
    if (currentInit !== initCountRef.current) return

    isLoadingRef.current = false

    // Restore history if available (survives browser refresh), otherwise create initial history from current canvas state.
    const persistedHistory = loadHistorySnapshot(currentHistoryKey)
    if (persistedHistory && persistedHistory.stack.length > 0) {
      historyRef.current = persistedHistory.stack
      historyIndexRef.current = persistedHistory.index
      setHistoryState((s) => s + 1)
    } else {
      historyRef.current = []
      historyIndexRef.current = -1
      saveToHistory()
    }
    
    // Call notifyUpdate immediately after objects are restored
    // Use Promise.resolve().then() for micro-task queue (executes before RAF/macrotasks)
    // This ensures viewContentRef is populated before parent's composeUVTexture() is called
    Promise.resolve().then(() => {
      if (currentInit === initCountRef.current) {
        notifyUpdate()
      }
    })

    if (onCanvasReady && fabricRef.current) {
      onCanvasReady(fabricRef.current)
    }

    // Track active canvas for mangas: clicking on right sleeve switches active canvas
    if (isMangas && fabricRef2.current) {
      fabricRef.current?.on("mouse:down", () => {
        if (onCanvasReady) onCanvasReady(fabricRef.current)
      })
      fabricRef2.current?.on("mouse:down", () => {
        if (onCanvasReady) onCanvasReady(fabricRef2.current)
      })
    }

    // Listen for object modifications on first canvas
    const events = ["object:modified", "object:added", "object:removed"]
    events.forEach((evt) => {
      fabricRef.current?.on(evt, () => {
        if (!isLoadingRef.current) {
          const saveKey = isMangas ? primaryMangaKey : activeView
          persistCanvasState(fabricRef.current, saveKey, evt === "object:removed")
          saveToHistory()
          notifyUpdate()
          onCanvasStateChange?.()
        }
      })
    })

    if (fabricRef2.current) {
      events.forEach((evt) => {
        fabricRef2.current?.on(evt, () => {
          if (!isLoadingRef.current) {
            persistCanvasState(fabricRef2.current, secondaryMangaKey, evt === "object:removed")
            saveToHistory()
            notifyUpdate()
            onCanvasStateChange?.()
          }
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, isMangas])

  useEffect(() => {
    initCanvas()

    let resizeTimer: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        initCanvas()
      }, 300)
    }
    window.addEventListener("resize", handleResize)
    return () => {
      clearTimeout(resizeTimer)
      window.removeEventListener("resize", handleResize)
      if (fabricRef.current) {
        try {
          if (fabricRef.current.__keyHandler) document.removeEventListener("keydown", fabricRef.current.__keyHandler)
          fabricRef.current.dispose()
        } catch { /* ignore */ }
      }
      if (canvasRef.current) {
        canvasInstanceMapRef.current.delete(canvasRef.current)
      }
      if (fabricRef2.current) {
        try {
          if (fabricRef2.current.__keyHandler) document.removeEventListener("keydown", fabricRef2.current.__keyHandler)
          fabricRef2.current.dispose()
        } catch { /* ignore */ }
      }
      if (canvasRef2.current) {
        canvasInstanceMapRef.current.delete(canvasRef2.current)
      }
    }
  }, [initCanvas])

  const handleUndo = useCallback(async () => {
    if (!fabricRef.current || !fabricModuleRef.current || historyIndexRef.current <= 0 || historyBusyRef.current) return
    historyBusyRef.current = true
    setIsHistoryBusy(true)
    historyIndexRef.current--
    isLoadingRef.current = true
    try {
      // Remove current user objects (keep zones and background intact)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toRemove = fabricRef.current.getObjects().filter((o: any) => !o._isZone)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toRemove.forEach((o: any) => fabricRef.current.remove(o))

      const data = JSON.parse(historyRef.current[historyIndexRef.current])
      if (data.length > 0) {
        const restored = await fabricModuleRef.current.util.enlivenObjects(data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        restored.forEach((o: any) => {
          o._autoFitted = true
          enforceMinimumSize(o)
          fabricRef.current.add(o)
        })
      }
    } catch { /* ignore */ }
    finally {
      fabricRef.current.renderAll()
      isLoadingRef.current = false
      const saveKey = isMangas ? primaryMangaKey : activeView
      persistCanvasState(fabricRef.current, saveKey, true)
      notifyUpdate(true)
      saveHistorySnapshot(saveKey)
      setHistoryState((s) => s + 1)
      historyBusyRef.current = false
      setIsHistoryBusy(false)
    }
  }, [activeView, isMangas, notifyUpdate, persistCanvasState, primaryMangaKey, saveHistorySnapshot])

  const handleRedo = useCallback(async () => {
    if (!fabricRef.current || !fabricModuleRef.current || historyIndexRef.current >= historyRef.current.length - 1 || historyBusyRef.current) return
    historyBusyRef.current = true
    setIsHistoryBusy(true)
    historyIndexRef.current++
    isLoadingRef.current = true
    try {
      // Remove current user objects (keep zones and background intact)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toRemove = fabricRef.current.getObjects().filter((o: any) => !o._isZone)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toRemove.forEach((o: any) => fabricRef.current.remove(o))

      const data = JSON.parse(historyRef.current[historyIndexRef.current])
      if (data.length > 0) {
        const restored = await fabricModuleRef.current.util.enlivenObjects(data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        restored.forEach((o: any) => {
          o._autoFitted = true
          enforceMinimumSize(o)
          fabricRef.current.add(o)
        })
      }
    } catch { /* ignore */ }
    finally {
      fabricRef.current.renderAll()
      isLoadingRef.current = false
      const saveKey = isMangas ? primaryMangaKey : activeView
      persistCanvasState(fabricRef.current, saveKey, true)
      notifyUpdate(true)
      saveHistorySnapshot(saveKey)
      setHistoryState((s) => s + 1)
      historyBusyRef.current = false
      setIsHistoryBusy(false)
    }
  }, [activeView, isMangas, notifyUpdate, persistCanvasState, primaryMangaKey, saveHistorySnapshot])

  const canUndo = !isHistoryBusy && historyIndexRef.current > 0
  const canRedo = !isHistoryBusy && historyIndexRef.current < historyRef.current.length - 1

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (historyBusyRef.current) return
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        if (canGlobalUndo) {
          onGlobalUndo?.()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        if (canGlobalRedo) {
          onGlobalRedo?.()
        }
      }
    }
    document.addEventListener("keydown", handleGlobalKey)
    return () => document.removeEventListener("keydown", handleGlobalKey)
  }, [canGlobalRedo, canGlobalUndo, canRedo, canUndo, handleRedo, handleUndo, onGlobalRedo, onGlobalUndo])

  const handleUndoAction = useCallback(() => {
    if (canGlobalUndo) {
      onGlobalUndo?.()
    }
  }, [canGlobalUndo, onGlobalUndo])

  const handleRedoAction = useCallback(() => {
    if (canGlobalRedo) {
      onGlobalRedo?.()
    }
  }, [canGlobalRedo, onGlobalRedo])

  const handleCloseMangasIntro = useCallback(() => {
    setShowMangasIntro(false)
    try {
      localStorage.setItem(MANGAS_INTRO_KEY, "seen")
    } catch {
      // ignore storage errors
    }
  }, [])

  return (
    <div className="flex flex-1 flex-col">
      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{ minHeight: 550 }}
      >
        {/* Invisible sizer that measures available space without being affected by canvas content */}
        <div ref={sizerRef} className="absolute inset-0" />
        {/* Canvas content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden p-2">
          <div className="shrink-0">
            <canvas ref={canvasRef} />
          </div>
          <div className={`shrink-0 ${!isMangas ? 'hidden' : ''}`}>
            <canvas ref={canvasRef2} />
          </div>
        </div>
      </div>

      {/* Bottom bar: undo/redo on the far left */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <button
          onClick={handleUndoAction}
          disabled={!canGlobalUndo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/30 bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleRedoAction}
          disabled={!canGlobalRedo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/30 bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <AlertDialog
        open={showMangasIntro}
        onOpenChange={(open) => {
          if (!open) handleCloseMangasIntro()
        }}
      >
        <AlertDialogContent className="max-w-md">
          <div className="flex flex-col gap-3">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-foreground">
                Personaliza una manga
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Antes de agregar imágenes o textos, haz clic en la manga que quieres personalizar.
                Así el contenido se colocará en el molde correcto.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="overflow-hidden rounded-lg border border-border bg-muted/40 p-1">
              <img
                src="/images/InformacionMangas.png"
                alt="Referencia para personalizar mangas"
                className="h-auto w-full rounded-md"
                draggable={false}
              />
            </div>
            <div className="flex justify-end">
              <AlertDialogAction onClick={handleCloseMangasIntro} className="bg-purple-600 hover:bg-purple-700 text-white">
                Entendido
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
