"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { Undo2, Redo2 } from "lucide-react"
import type { TemplateView } from "./template-selector"

// Zone definitions per template view (relative coords 0-1)
// To adjust a zone: x = left edge, y = top edge, w = width, h = height (all 0-1)
const zoneConfigs: Record<string, { x: number; y: number; w: number; h: number }[]> = {
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

interface FabricEditorProps {
  activeView: TemplateView
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCanvasReady?: (canvas: any) => void
  onCanvasUpdate?: (view: string, userContentDataUrl: string) => void
  initialViewObjects?: Record<string, string>
  onViewObjectsChange?: (view: string, serializedObjects: string | null) => void
}

export function FabricEditor({ activeView, onCanvasReady, onCanvasUpdate, initialViewObjects, onViewObjectsChange }: FabricEditorProps) {
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

  const isMangas = activeView === "mangas"

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
      // Higher base multiplier for better quality, capped at 5 to avoid artifacts
      const multiplier = Math.min(5, Math.max(3, Math.ceil(2048 / Math.max(cw, ch))))
      const outW = Math.round(cw * multiplier)
      const outH = Math.round(ch * multiplier)

      // Temporarily hide background/zones to get user-only content
      const origBg = canvas.backgroundColor
      const origBgImage = canvas.backgroundImage
      canvas.backgroundColor = "rgba(0,0,0,0)"
      canvas.backgroundImage = null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hidden: any[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((obj: any) => {
        if (obj._isZone) {
          obj.visible = false
          hidden.push(obj)
        }
      })
      canvas.renderAll()

      // Get high-res canvas element with user content (synchronous)
      const userCanvas = canvas.toCanvasElement(multiplier)

      // Restore original canvas state
      canvas.backgroundColor = origBg
      canvas.backgroundImage = origBgImage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hidden.forEach((o: any) => { o.visible = true })
      canvas.renderAll()

      // Build clipped output: only zone regions are visible in 3D
      const vk = viewKey || activeView
      const zones = zoneConfigs[vk] || []

      // Create offscreen canvas with transparent background
      const offscreen = document.createElement("canvas")
      offscreen.width = outW
      offscreen.height = outH
      const ctx = offscreen.getContext("2d", { alpha: true })
      if (!ctx) return userCanvas.toDataURL("image/png")

      // Clear with full transparency
      ctx.clearRect(0, 0, outW, outH)

      // Draw only the zone regions (no clip artifacts)
      if (zones.length > 0) {
        for (const z of zones) {
          const sx = z.x * outW
          const sy = z.y * outH
          const sw = z.w * outW
          const sh = z.h * outH
          ctx.drawImage(userCanvas, sx, sy, sw, sh, sx, sy, sw, sh)
        }
      } else {
        // If no zones, draw entire user canvas
        ctx.drawImage(userCanvas, 0, 0, outW, outH)
      }

      return offscreen.toDataURL("image/png")
    } catch {
      return null
    }
  }, [activeView])

  const notifyUpdate = useCallback((forceClear = false) => {
    if (!onCanvasUpdate) return
    if (isMangas) {
      if (hasUserObjects(fabricRef.current) || forceClear) {
        const d1 = exportUserContent(fabricRef.current, "manga_izquierda")
        if (d1) onCanvasUpdate("manga_izquierda", d1)
      }
      if (hasUserObjects(fabricRef2.current) || forceClear) {
        const d2 = exportUserContent(fabricRef2.current, "manga_derecha")
        if (d2) onCanvasUpdate("manga_derecha", d2)
      }
    } else {
      if (hasUserObjects(fabricRef.current) || forceClear) {
        const d = exportUserContent(fabricRef.current, activeView)
        if (d) onCanvasUpdate(activeView, d)
      }
    }
  }, [onCanvasUpdate, isMangas, activeView, exportUserContent, hasUserObjects])

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
      setHistoryState((s) => s + 1)
    } catch {
      // ignore
    }
  }, [])

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
        backgroundColor: "#ffffff",
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
          tempCanvas.width = srcW
          tempCanvas.height = halfH
          const sy = half === "top" ? 0 : halfH
          tempCtx.drawImage(sourceImg, 0, sy, srcW, halfH, 0, 0, srcW, halfH)
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

          const zones = zoneConfigs[viewKey] || []
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

      // Auto-fit newly added objects into the first zone
      canvas.on("object:added", (e: { target?: any }) => {
        if (isLoadingRef.current) return
        const obj = e.target
        if (!obj || obj._isZone || obj._autoFitted) return
        const zones = zoneConfigs[viewKey] || []
        if (zones.length === 0) return
        const z = zones[0]
        const zW = z.w * canvasWidth
        const zH = z.h * canvasHeight
        // Auto-scale images to fit zone
        if (obj.type === "image") {
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
      })

      // Delete selected object with Delete/Backspace
      const handleKeyDown = (e: KeyboardEvent) => {
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
        const saveKey = prevIsMangas ? "manga_izquierda" : currentViewRef.current
        persistCanvasState(fabricRef.current, saveKey)
      }
      if (fabricRef2.current && prevIsMangas) {
        persistCanvasState(fabricRef2.current, "manga_derecha")
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

      const c1 = await initSingleCanvas(canvasRef.current, "manga_izquierda", finalWidth, singleHeight, currentInit, "top")
      if (!c1 || currentInit !== initCountRef.current) return

      fabricRef.current = c1

      if (canvasRef2.current) {
        const c2 = await initSingleCanvas(canvasRef2.current, "manga_derecha", finalWidth, singleHeight, currentInit, "bottom")
        if (!c2 || currentInit !== initCountRef.current) return
        fabricRef2.current = c2
      }
    } else {
      // Single canvas for frente/espalda - large
      const aspect = 0.65
      let canvasWidth = Math.min(containerWidth - 16, 700)
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
      if (fabricRef.current) await restoreUserObjects(fabricRef.current, "manga_izquierda")
      if (fabricRef2.current) await restoreUserObjects(fabricRef2.current, "manga_derecha")
    } else {
      if (fabricRef.current) await restoreUserObjects(fabricRef.current, activeView)
    }
    if (currentInit !== initCountRef.current) return

    isLoadingRef.current = false

    // Save initial history
    historyRef.current = []
    historyIndexRef.current = -1
    saveToHistory()
    notifyUpdate()

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
          const saveKey = isMangas ? "manga_izquierda" : activeView
          persistCanvasState(fabricRef.current, saveKey, evt === "object:removed")
          saveToHistory()
          notifyUpdate()
        }
      })
    })

    if (fabricRef2.current) {
      events.forEach((evt) => {
        fabricRef2.current?.on(evt, () => {
          if (!isLoadingRef.current) {
            persistCanvasState(fabricRef2.current, "manga_derecha", evt === "object:removed")
            notifyUpdate()
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
          fabricRef.current.add(o)
        })
      }
    } catch { /* ignore */ }
    finally {
      fabricRef.current.renderAll()
      isLoadingRef.current = false
      const saveKey = isMangas ? "manga_izquierda" : activeView
      persistCanvasState(fabricRef.current, saveKey, true)
      notifyUpdate(true)
      setHistoryState((s) => s + 1)
      historyBusyRef.current = false
      setIsHistoryBusy(false)
    }
  }, [activeView, isMangas, notifyUpdate, persistCanvasState])

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
          fabricRef.current.add(o)
        })
      }
    } catch { /* ignore */ }
    finally {
      fabricRef.current.renderAll()
      isLoadingRef.current = false
      const saveKey = isMangas ? "manga_izquierda" : activeView
      persistCanvasState(fabricRef.current, saveKey, true)
      notifyUpdate(true)
      setHistoryState((s) => s + 1)
      historyBusyRef.current = false
      setIsHistoryBusy(false)
    }
  }, [activeView, isMangas, notifyUpdate, persistCanvasState])

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (historyBusyRef.current) return
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener("keydown", handleGlobalKey)
    return () => document.removeEventListener("keydown", handleGlobalKey)
  }, [handleUndo, handleRedo])

  const canUndo = !isHistoryBusy && historyIndexRef.current > 0
  const canRedo = !isHistoryBusy && historyIndexRef.current < historyRef.current.length - 1

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
          onClick={handleUndo}
          disabled={!canUndo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/30 bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          title="Deshacer (Ctrl+Z)"
          aria-label="Deshacer"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/30 bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
          title="Rehacer (Ctrl+Y)"
          aria-label="Rehacer"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
