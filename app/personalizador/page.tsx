"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Header } from "@/components/ui/header"
import { Footer } from "@/components/ui/footer"
import { Toolbar } from "@/components/ui/toolbar"
import { FabricEditor } from "@/components/ui/fabric-editor"
import { TemplateSelector, type TemplateView } from "@/components/ui/template-selector"
import { useStripedDesignTexture } from "@/hooks/use-striped-design-texture"
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertTriangle } from "lucide-react"
import NextImage from "next/image"

const TShirtPreview3D = dynamic(
  () => import("@/components/ui/tshirt-preview-3d").then((mod) => ({ default: mod.TShirtPreview3D })),
  { ssr: false, loading: () => <Preview3DPlaceholder /> }
)

function Preview3DPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        <span className="text-sm text-muted-foreground">Cargando vista 3D...</span>
      </div>
    </div>
  )
}

interface UploadedImage {
  id: string
  name: string
  dataUrl: string
}

// UV regions on the composite texture (normalized 0-1, from Blender UV map).
// These control how part colors and texture content land on the 3D model.
const UV_REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  frente:          { x: 0.0000, y: 0.1172, w: 0.50, h: 0.6527 },
  espalda:         { x: 0.50, y: 0.1172, w: 0.45, h: 0.7227 },
  manga_izquierda: { x: 0.000, y: 0.8008, w: 0.550, h: 0.15 },
  manga_derecha:   { x: 0.50, y: 0.8008, w: 0.40, h: 0.1592 },
}

// Neck color regions are also part of the 3D texture projection.
const NECK_REGIONS = {
  neck_front: { x: 0.100, y: 0.0586, w: 0.5044, h: 0.0195 },
  neck_back:  { x: 0.6250, y: 0.0586, w: 0.2344, h: 0.0195 },
}

// Manual projection compensation per view.
// Use values < 1 to reduce final size on the model, > 1 to enlarge it.
type UVViewKey = keyof typeof UV_REGIONS

const VIEW_CONTENT_SCALE: Partial<Record<UVViewKey, { x: number; y: number }>> = {
  manga_izquierda: { x: 0.65, y: 1 },
  manga_derecha: { x: 0.86, y: 1 },
}

// Optimized texture size for balance between quality and performance
// 2048x2048 is the best quality/performance compromise for dynamic apparel textures.
const TEXTURE_SIZE = 2048
const INTRO_MODAL_KEY = "darklion-personalizador-intro-v1"
const MAX_TEXT_LENGTH = 15

interface PartColors {
  frente: string
  espalda: string
  manga_izquierda: string
  manga_derecha: string
  cuello: string
}

interface StripedDesignConfig {
  enabled: boolean
  color1: string
  color2: string
  stripeCount: number
}

interface UnifiedHistoryItem {
  partColors: PartColors
  viewObjects: Record<string, string>
  viewContent: Record<string, string>
  uploadedImages: UploadedImage[]
}

interface PersistedUnifiedHistory {
  stack: UnifiedHistoryItem[]
  index: number
}

interface PersistedPersonalizadorState {
  activeView?: TemplateView
  partColors?: PartColors
  uploadedImages?: UploadedImage[]
  viewObjects?: Record<string, string>
  viewContent?: Record<string, string>
  unifiedHistory?: PersistedUnifiedHistory
}

const STORAGE_KEY = "darklion-personalizador-3d-v1"
const DEFAULT_PART_COLORS: PartColors = {
  frente: "#ffffff",
  espalda: "#ffffff",
  manga_izquierda: "#ffffff",
  manga_derecha: "#ffffff",
  cuello: "#ffffff",
}

const DEFAULT_STRIPED_DESIGN: StripedDesignConfig = {
  enabled: false,
  color1: "#1f4fa6",
  color2: "#58a8f6",
  stripeCount: 5,
}

export default function PersonalizadorPage() {
  const [activeView, setActiveView] = useState<TemplateView>("frente")
  const [bodyColor, setBodyColor] = useState("#393d42")
  const [partColors, setPartColors] = useState<PartColors>(DEFAULT_PART_COLORS)
  const [textureCanvas, setTextureCanvas] = useState<HTMLCanvasElement | null>(null)
  const [textureRevision, setTextureRevision] = useState(0)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [initialViewObjects, setInitialViewObjects] = useState<Record<string, string>>({})
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const [persistTick, setPersistTick] = useState(0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [stripedDesign, setStripedDesign] = useState<StripedDesignConfig>(DEFAULT_STRIPED_DESIGN)
  const [unifiedHistoryTick, setUnifiedHistoryTick] = useState(0)
  const [globalHistoryActionAt, setGlobalHistoryActionAt] = useState(0)
  const [historyRestoreTick, setHistoryRestoreTick] = useState(0)
  const [fabricEditorRestoreRevision, setFabricEditorRestoreRevision] = useState(0)
  const [fabricEditorRevision, setFabricEditorRevision] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null)
  const viewContentRef = useRef<Record<string, string>>({})
  const viewObjectsRef = useRef<Record<string, string>>({})
  const partColorsRef = useRef<PartColors>(partColors)
  const uploadedImagesRef = useRef<UploadedImage[]>(uploadedImages)
  const stripedDesignRef = useRef<StripedDesignConfig>(DEFAULT_STRIPED_DESIGN)
  const unifiedHistoryRef = useRef<UnifiedHistoryItem[]>([])
  const unifiedHistoryIndexRef = useRef(-1)
  const pendingCanvasHistoryRef = useRef(false)
  const lastFontFamilyRef = useRef<string>("Inter, sans-serif")
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const composeIdRef = useRef(0)
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({})
  const stripedDesignCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const composePendingRef = useRef<NodeJS.Timeout | null>(null)
  const composeIsRunningRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)
  const activeViewRef = useRef<TemplateView>("frente")

  const stripedDesignTexture = useStripedDesignTexture({
    color1: stripedDesign.color1,
    color2: stripedDesign.color2,
    stripeCount: stripedDesign.stripeCount,
    resolution: TEXTURE_SIZE,
    enabled: stripedDesign.enabled,
  })

  useEffect(() => {
    document.title = "Dark Lion - Personalizador 3D"
  }, [])

  const normalizeUnifiedHistoryItem = useCallback((item?: Partial<UnifiedHistoryItem> | null): UnifiedHistoryItem => {
    return {
      partColors: { ...DEFAULT_PART_COLORS, ...(item?.partColors ?? {}) },
      viewObjects: { ...(item?.viewObjects ?? {}) },
      viewContent: { ...(item?.viewContent ?? {}) },
      uploadedImages: Array.isArray(item?.uploadedImages) ? [...item.uploadedImages] : [],
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? (JSON.parse(raw) as PersistedPersonalizadorState) : null

      const nextActiveView = parsed?.activeView ?? "frente"
      const nextPartColorsFromState = { ...DEFAULT_PART_COLORS, ...(parsed?.partColors ?? {}) }
      const nextViewObjects = (parsed?.viewObjects && typeof parsed.viewObjects === "object")
        ? parsed.viewObjects
        : {}
      const nextViewContent = (parsed?.viewContent && typeof parsed.viewContent === "object")
        ? parsed.viewContent
        : {}
      const nextUploadedImages = Array.isArray(parsed?.uploadedImages)
        ? parsed.uploadedImages
        : []

      const persistedUnified = parsed?.unifiedHistory
      const hasPersistedUnified = !!persistedUnified && Array.isArray(persistedUnified.stack) && persistedUnified.stack.length > 0
      const compactUnifiedStack: UnifiedHistoryItem[] = hasPersistedUnified
        ? persistedUnified.stack.map((item) => ({
            partColors: { ...DEFAULT_PART_COLORS, ...(item?.partColors ?? {}) },
            viewObjects: {},
            viewContent: {},
            uploadedImages: [],
          }))
        : [{
            partColors: nextPartColorsFromState,
            viewObjects: {},
            viewContent: {},
            uploadedImages: [],
          }]
      const compactUnifiedIndex = hasPersistedUnified
        ? Math.max(0, Math.min(persistedUnified!.index ?? 0, compactUnifiedStack.length - 1))
        : 0
      const nextPartColors = compactUnifiedStack[compactUnifiedIndex]?.partColors ?? nextPartColorsFromState

      activeViewRef.current = nextActiveView
      partColorsRef.current = nextPartColors
      viewObjectsRef.current = nextViewObjects
      viewContentRef.current = nextViewContent
      uploadedImagesRef.current = nextUploadedImages

      setActiveView(nextActiveView)
      setPartColors(nextPartColors)
      setInitialViewObjects(nextViewObjects)
      setUploadedImages(nextUploadedImages)

      unifiedHistoryRef.current = compactUnifiedStack
      unifiedHistoryIndexRef.current = compactUnifiedIndex
    } catch {
      const fallbackColors = { ...DEFAULT_PART_COLORS }
      activeViewRef.current = "frente"
      partColorsRef.current = fallbackColors
      viewObjectsRef.current = {}
      viewContentRef.current = {}
      uploadedImagesRef.current = []
      setActiveView("frente")
      setPartColors(fallbackColors)
      setInitialViewObjects({})
      setUploadedImages([])
      unifiedHistoryRef.current = [{
        partColors: fallbackColors,
        viewObjects: {},
        viewContent: {},
        uploadedImages: [],
      }]
      unifiedHistoryIndexRef.current = 0
    } finally {
      setIsPersistenceReady(true)
      setUnifiedHistoryTick((tick) => tick + 1)
    }
  }, [])

  useEffect(() => {
    if (!isPersistenceReady) return

    try {
      const seenIntro = localStorage.getItem(INTRO_MODAL_KEY)
      if (!seenIntro) {
        setShowIntroModal(true)
      }
    } catch {
      setShowIntroModal(true)
    }
  }, [isPersistenceReady])

  const handleCanvasReady = useCallback((canvas: unknown) => {
    fabricCanvasRef.current = canvas
  }, [])

  const onLastFontFamilyChange = useCallback((fontFamily: string) => {
    lastFontFamilyRef.current = fontFamily
  }, [])

  useEffect(() => {
    stripedDesignRef.current = stripedDesign
  }, [stripedDesign])

  useEffect(() => {
    const image = stripedDesignTexture?.image
    stripedDesignCanvasRef.current = image instanceof HTMLCanvasElement ? image : null
  }, [stripedDesignTexture])

  // Store compose function in ref to avoid dependency issues
  const composeUVTextureRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    // Only define composeUVTexture logic once on mount or activeView change
    composeUVTextureRef.current = async () => {
      if (composeIsRunningRef.current) return // Skip if already composing
      composeIsRunningRef.current = true
      
      try {
      const currentId = ++composeIdRef.current

      if (!compositeCanvasRef.current) {
        compositeCanvasRef.current = document.createElement("canvas")
        compositeCanvasRef.current.width = TEXTURE_SIZE
        compositeCanvasRef.current.height = TEXTURE_SIZE
      }

      const cvs = compositeCanvasRef.current
      const ctx = cvs.getContext("2d")
      if (!ctx) return
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // Fill neutral base first
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

      // Apply base color by model part with padding to reduce edge seams
      const regionPadding = 10
      Object.entries(UV_REGIONS).forEach(([partKey, region]) => {
        const color = partColorsRef.current[partKey as keyof PartColors] ?? "#ffffff"
        ctx.fillStyle = color
        const px = region.x * TEXTURE_SIZE
        const py = region.y * TEXTURE_SIZE
        const pw = region.w * TEXTURE_SIZE
        const ph = region.h * TEXTURE_SIZE
        const left = Math.max(0, px - regionPadding)
        const top = Math.max(0, py - regionPadding)
        const right = Math.min(TEXTURE_SIZE, px + pw + regionPadding)
        const bottom = Math.min(TEXTURE_SIZE, py + ph + regionPadding)
        ctx.fillRect(
          left,
          top,
          right - left,
          bottom - top
        )
      })

      // Neck front/back share one color control (cuello)
      const neckColor = partColorsRef.current.cuello ?? "#ffffff"
      ctx.fillStyle = neckColor
      Object.values(NECK_REGIONS).forEach((region) => {
        const px = region.x * TEXTURE_SIZE
        const py = region.y * TEXTURE_SIZE
        const pw = region.w * TEXTURE_SIZE
        const ph = region.h * TEXTURE_SIZE
        const left = Math.max(0, px - regionPadding)
        const top = Math.max(0, py - regionPadding)
        const right = Math.min(TEXTURE_SIZE, px + pw + regionPadding)
        const bottom = Math.min(TEXTURE_SIZE, py + ph + regionPadding)
        ctx.fillRect(left, top, right - left, bottom - top)
      })

      // Overlay Tackle striped design before user uploads/texts, so user content stays on top.
      if (stripedDesignRef.current.enabled) {
        if (stripedDesignCanvasRef.current) {
          ctx.drawImage(stripedDesignCanvasRef.current, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
        } else {
          // Fallback: draw stripes directly to avoid transient disappearance if hook texture is not ready.
          const safeStripeCount = Math.max(1, Math.floor(stripedDesignRef.current.stripeCount || 1))
          Object.values(UV_REGIONS).forEach((region) => {
            const px = region.x * TEXTURE_SIZE
            const py = region.y * TEXTURE_SIZE
            const pw = region.w * TEXTURE_SIZE
            const ph = region.h * TEXTURE_SIZE
            const stripeHeight = ph / safeStripeCount

            for (let i = 0; i < safeStripeCount; i++) {
              const top = py + stripeHeight * i
              const nextTop = i === safeStripeCount - 1 ? py + ph : py + stripeHeight * (i + 1)
              const height = Math.max(0, nextTop - top)
              ctx.fillStyle = i % 2 === 0 ? stripedDesignRef.current.color1 : stripedDesignRef.current.color2
              ctx.fillRect(px, top, pw, height)
            }
          })
        }
      }

      // Load all per-view images (use cache to avoid reloading)
      const entries = Object.entries(viewContentRef.current).filter(([, url]) => !!url)
      const loaded: { view: string; img: HTMLImageElement }[] = []

      await Promise.all(
        entries.map(
          ([view, dataUrl]) =>
            new Promise<void>((resolve) => {
              // Check cache first
              if (imageCacheRef.current[dataUrl]) {
                loaded.push({ view, img: imageCacheRef.current[dataUrl] })
                resolve()
                return
              }

              const img = new Image()
              img.onload = () => {
                imageCacheRef.current[dataUrl] = img // Cache the loaded image
                loaded.push({ view, img })
                resolve()
              }
              img.onerror = () => resolve()
              img.src = dataUrl
            })
        )
      )

      if (currentId !== composeIdRef.current) return

      // Draw each view's user content at its UV position
      for (const { view, img } of loaded) {
        const r = UV_REGIONS[view]
        if (!r) continue

        const scale = VIEW_CONTENT_SCALE[view as UVViewKey] ?? { x: 1, y: 1 }
        const baseW = r.w * TEXTURE_SIZE
        const baseH = r.h * TEXTURE_SIZE
        const drawW = baseW * scale.x
        const drawH = baseH * scale.y
        const drawX = r.x * TEXTURE_SIZE + (baseW - drawW) / 2
        const drawY = r.y * TEXTURE_SIZE + (baseH - drawH) / 2

        ctx.drawImage(
          img,
          drawX,
          drawY,
          drawW,
          drawH
        )
      }

      if (currentId !== composeIdRef.current) return
      setTextureCanvas(cvs)
      setTextureRevision((v) => v + 1)
      } finally {
        composeIsRunningRef.current = false
      }
    }
  }, [])

  const composeUVTexture = useCallback(() => {
    composeUVTextureRef.current()
  }, [])

  const handleApplyStripedDesign = useCallback((config: StripedDesignConfig) => {
    stripedDesignRef.current = config
    setStripedDesign(config)
  }, [])

  const persistStateNow = useCallback(() => {
    if (!isPersistenceReady) return
    try {
      const compactUnifiedStack: UnifiedHistoryItem[] = []
      let compactUnifiedIndex = 0
      let lastColorKey = ""

      unifiedHistoryRef.current.forEach((item, idx) => {
        const normalizedColors = { ...DEFAULT_PART_COLORS, ...(item?.partColors ?? {}) }
        const colorKey = JSON.stringify(normalizedColors)
        if (idx === 0 || colorKey !== lastColorKey) {
          compactUnifiedStack.push({
            partColors: normalizedColors,
            viewObjects: {},
            viewContent: {},
            uploadedImages: [],
          })
          lastColorKey = colorKey
        }
        if (idx <= unifiedHistoryIndexRef.current) {
          compactUnifiedIndex = compactUnifiedStack.length - 1
        }
      })

      if (compactUnifiedStack.length === 0) {
        compactUnifiedStack.push({
          partColors: { ...DEFAULT_PART_COLORS },
          viewObjects: {},
          viewContent: {},
          uploadedImages: [],
        })
        compactUnifiedIndex = 0
      }

      const payload: PersistedPersonalizadorState = {
        activeView: activeViewRef.current,
        partColors: partColorsRef.current,
        viewObjects: viewObjectsRef.current,
        unifiedHistory: {
          stack: compactUnifiedStack,
          index: Math.max(0, Math.min(compactUnifiedIndex, compactUnifiedStack.length - 1)),
        },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore quota/storage errors
    }
  }, [isPersistenceReady])

  const handleCanvasUpdate = useCallback(
    (view: string, userContentDataUrl: string) => {
      viewContentRef.current[view] = userContentDataUrl
      persistStateNow()
      setPersistTick((tick) => tick + 1)
      // Compose immediately (not debounced) for instant visual feedback on canvas changes
      composeUVTexture()
    },
    [composeUVTexture, persistStateNow]
  )

  const handleViewObjectsChange = useCallback((view: string, serializedObjects: string | null) => {
    if (serializedObjects) {
      viewObjectsRef.current[view] = serializedObjects
    } else {
      delete viewObjectsRef.current[view]
    }
    persistStateNow()
    setInitialViewObjects({ ...viewObjectsRef.current })
    setPersistTick((tick) => tick + 1)
  }, [persistStateNow])

  const createUnifiedHistorySnapshot = useCallback((overrides?: Partial<UnifiedHistoryItem>): UnifiedHistoryItem => {
    return normalizeUnifiedHistoryItem({
      partColors: overrides?.partColors ?? partColorsRef.current,
      viewObjects: overrides?.viewObjects ?? viewObjectsRef.current,
      viewContent: overrides?.viewContent ?? viewContentRef.current,
      uploadedImages: overrides?.uploadedImages ?? uploadedImagesRef.current,
    })
  }, [normalizeUnifiedHistoryItem])

  const recordUnifiedHistory = useCallback((overrides?: Partial<UnifiedHistoryItem>) => {
    const nextSnapshot = createUnifiedHistorySnapshot(overrides)
    const currentSnapshot = unifiedHistoryRef.current[unifiedHistoryIndexRef.current]
    if (currentSnapshot && JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
      return
    }

    const nextHistory = unifiedHistoryRef.current.slice(0, unifiedHistoryIndexRef.current + 1)
    nextHistory.push(nextSnapshot)
    unifiedHistoryRef.current = nextHistory
    unifiedHistoryIndexRef.current = nextHistory.length - 1
    setUnifiedHistoryTick((tick) => tick + 1)
  }, [createUnifiedHistorySnapshot])

  const applyUnifiedHistorySnapshot = useCallback((snapshot: UnifiedHistoryItem) => {
    const normalizedSnapshot = normalizeUnifiedHistoryItem(snapshot)
    const nextPartColors = normalizedSnapshot.partColors
    const snapshotHasViewObjects = Object.keys(normalizedSnapshot.viewObjects).length > 0
    const nextViewObjects = snapshotHasViewObjects
      ? normalizedSnapshot.viewObjects
      : viewObjectsRef.current
    const nextViewContent: Record<string, string> = {}
    const sourceViewContent = snapshotHasViewObjects
      ? normalizedSnapshot.viewContent
      : viewContentRef.current
    Object.entries(sourceViewContent).forEach(([view, content]) => {
      if (nextViewObjects[view]) {
        nextViewContent[view] = content
      }
    })
    const nextUploadedImages = normalizedSnapshot.uploadedImages.length > 0
      ? normalizedSnapshot.uploadedImages
      : uploadedImagesRef.current

    partColorsRef.current = nextPartColors
    viewObjectsRef.current = nextViewObjects
    viewContentRef.current = nextViewContent
    uploadedImagesRef.current = nextUploadedImages

    setPartColors(nextPartColors)
    setUploadedImages(nextUploadedImages)
    setInitialViewObjects(nextViewObjects)
    setPersistTick((tick) => tick + 1)
    setFabricEditorRestoreRevision((revision) => revision + 1)
    setHistoryRestoreTick((tick) => tick + 1)
    setUnifiedHistoryTick((tick) => tick + 1)
    composeUVTexture()
  }, [composeUVTexture, normalizeUnifiedHistoryItem])

  const scheduleCanvasHistoryRecord = useCallback(() => {
    if (pendingCanvasHistoryRef.current) return
    pendingCanvasHistoryRef.current = true
    queueMicrotask(() => {
      pendingCanvasHistoryRef.current = false
      recordUnifiedHistory()
    })
  }, [recordUnifiedHistory])

  const handlePartColorChange = useCallback((part: keyof PartColors, color: string) => {
    setPartColors((prev) => {
      if (prev[part] === color) return prev
      const next = { ...prev, [part]: color }
      partColorsRef.current = next
      setGlobalHistoryActionAt(Date.now())
      recordUnifiedHistory({ partColors: next })
      return next
    })
  }, [recordUnifiedHistory])

  const handleUnifiedUndo = useCallback(() => {
    if (unifiedHistoryIndexRef.current <= 0) return
    unifiedHistoryIndexRef.current -= 1
    const snapshot = unifiedHistoryRef.current[unifiedHistoryIndexRef.current]
    if (!snapshot) return

    const normalizedSnapshot = normalizeUnifiedHistoryItem(snapshot)
    setGlobalHistoryActionAt(Date.now())
    applyUnifiedHistorySnapshot(normalizedSnapshot)
  }, [applyUnifiedHistorySnapshot, normalizeUnifiedHistoryItem])

  const handleUnifiedRedo = useCallback(() => {
    if (unifiedHistoryIndexRef.current >= unifiedHistoryRef.current.length - 1) return
    unifiedHistoryIndexRef.current += 1
    const snapshot = unifiedHistoryRef.current[unifiedHistoryIndexRef.current]
    if (!snapshot) return
    setGlobalHistoryActionAt(Date.now())
    applyUnifiedHistorySnapshot(snapshot)
  }, [applyUnifiedHistorySnapshot])

  const canUnifiedUndo = unifiedHistoryIndexRef.current > 0
  const canUnifiedRedo = unifiedHistoryIndexRef.current < unifiedHistoryRef.current.length - 1

  useEffect(() => {
    partColorsRef.current = partColors
    
    // Clear any pending timeout
    if (composePendingRef.current) {
      clearTimeout(composePendingRef.current)
    }
    
    // Cancel any pending RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }
    
    // Use requestAnimationFrame for smooth 60fps, bound to browser repaint cycle
    // Only compose if not already running
    if (!composeIsRunningRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        composeUVTexture()
        rafIdRef.current = null
      })
    }
    
    return () => {
      if (composePendingRef.current) {
        clearTimeout(composePendingRef.current)
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [partColors])

  useEffect(() => {
    uploadedImagesRef.current = uploadedImages
  }, [uploadedImages])

  useEffect(() => {
    composeUVTexture()
  }, [composeUVTexture, stripedDesignTexture])

  useEffect(() => {
    composeUVTexture()
  }, [composeUVTexture, stripedDesign])

  useEffect(() => {
    activeViewRef.current = activeView
  }, [activeView])

  useEffect(() => {
    if (!isPersistenceReady) return
    
    // Generate initial texture after persistence is ready
    composeUVTexture()
  }, [isPersistenceReady])

  useEffect(() => {
    if (!isPersistenceReady) return
    activeViewRef.current = activeView
    partColorsRef.current = partColors
    persistStateNow()
  }, [isPersistenceReady, activeView, partColors, persistTick, persistStateNow])

  useEffect(() => {
    if (!isPersistenceReady) return

    const flushPersistenceNow = () => {
      persistStateNow()
    }

    window.addEventListener("beforeunload", flushPersistenceNow)
    window.addEventListener("pagehide", flushPersistenceNow)

    return () => {
      window.removeEventListener("beforeunload", flushPersistenceNow)
      window.removeEventListener("pagehide", flushPersistenceNow)
    }
  }, [isPersistenceReady, persistStateNow])

  const normalizeImageDataUrl = useCallback(async (dataUrl: string, maxDimension = 1024): Promise<string> => {
    try {
      const img = new Image()
      await new Promise<void>((resolve) => {
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = dataUrl
      })

      if (!img.naturalWidth || !img.naturalHeight) return dataUrl

      const longestSide = Math.max(img.naturalWidth, img.naturalHeight)
      if (longestSide <= maxDimension) return dataUrl

      const scale = maxDimension / longestSide
      const targetW = Math.max(1, Math.round(img.naturalWidth * scale))
      const targetH = Math.max(1, Math.round(img.naturalHeight * scale))

      const canvas = document.createElement("canvas")
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext("2d")
      if (!ctx) return dataUrl

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0, targetW, targetH)
      return canvas.toDataURL("image/png")
    } catch {
      return dataUrl
    }
  }, [])

  const addImageToCanvas = useCallback(async (dataUrl: string) => {
    const fabricModule = await import("fabric")
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const imgEl = document.createElement("img")
    imgEl.crossOrigin = "anonymous"
    imgEl.onload = () => {
      const maxSize = 150
      const scale = Math.min(maxSize / imgEl.naturalWidth, maxSize / imgEl.naturalHeight, 1)
      const fabricImg = new fabricModule.FabricImage(imgEl, {
        left: 80,
        top: 80,
        scaleX: scale,
        scaleY: scale,
      })
      canvas.add(fabricImg)
      canvas.setActiveObject(fabricImg)
      canvas.renderAll()
    }
    imgEl.src = dataUrl
  }, [])

  const handleImageUpload = useCallback(async (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const sourceDataUrl = e.target?.result as string
      if (!sourceDataUrl) return

      void (async () => {
        const dataUrl = await normalizeImageDataUrl(sourceDataUrl)
        // Save to uploaded images gallery
        setUploadedImages((prev) => [
          ...prev,
          { id: Date.now().toString(), name: file.name, dataUrl },
        ])
        // Add to canvas
        addImageToCanvas(dataUrl)
      })()
    }
    reader.readAsDataURL(file)
  }, [addImageToCanvas, normalizeImageDataUrl])

  const handleAddText = useCallback(async (text: string, fontFamily: string, color: string) => {
    const fabricModule = await import("fabric")
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const finalText = text.slice(0, MAX_TEXT_LENGTH)
    if (!finalText.trim()) return

    const itext = new fabricModule.IText(finalText, {
      left: 100,
      top: 140,
      fontSize: 28,
      fill: color,
      fontFamily: fontFamily,
    })
    canvas.add(itext)
    canvas.setActiveObject(itext)
    canvas.renderAll()
  }, [])

  const handleUpdateSelectedTextStyle = useCallback((fontFamily: string, color: string) => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeObject = canvas.getActiveObject() as any
    if (!activeObject) return false

    let updated = false

    // Multi-selection support
    if (activeObject.type === "activeSelection" && Array.isArray(activeObject._objects)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activeObject._objects.forEach((obj: any) => {
        if (obj?.isType?.("i-text") || obj?.isType?.("text") || obj?.isType?.("textbox")) {
          obj.set({ fontFamily, fill: color })
          obj.setCoords()
          updated = true
        }
      })
    } else if (activeObject.isType?.("i-text") || activeObject.isType?.("text") || activeObject.isType?.("textbox")) {
      activeObject.set({ fontFamily, fill: color })
      activeObject.setCoords()
      updated = true
    }

    if (!updated) return false

    canvas.requestRenderAll()
    canvas.fire("object:modified", { target: activeObject })
    return true
  }, [])

  const handleAddUploadedImage = useCallback((dataUrl: string) => {
    addImageToCanvas(dataUrl)
  }, [addImageToCanvas])

  const handleRemoveUploadedImage = useCallback((id: string) => {
    setUploadedImages((prev) => {
      const updated = prev.filter((img) => img.id !== id)
      // Clean up image cache for removed images
      const removed = prev.find((img) => img.id === id)
      if (removed && imageCacheRef.current[removed.dataUrl]) {
        delete imageCacheRef.current[removed.dataUrl]
      }
      return updated
    })
  }, [])

  const handleResetAllChanges = useCallback(() => {
    setPartColors({ ...DEFAULT_PART_COLORS })
    setUploadedImages([])
    setTextureCanvas(null)
    viewContentRef.current = {}
    viewObjectsRef.current = {}
    uploadedImagesRef.current = []
    unifiedHistoryRef.current = [{
      partColors: { ...DEFAULT_PART_COLORS },
      viewObjects: {},
      viewContent: {},
      uploadedImages: [],
    }]
    unifiedHistoryIndexRef.current = 0
    pendingCanvasHistoryRef.current = false
    setUnifiedHistoryTick((tick) => tick + 1)
    setInitialViewObjects({})
    setFabricEditorRevision((revision) => revision + 1)
    setShowResetConfirm(false)

    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }

    window.location.reload()
  }, [])

  const handleCloseIntroModal = useCallback(() => {
    setShowIntroModal(false)
    try {
      localStorage.setItem(INTRO_MODAL_KEY, "seen")
    } catch {
      // ignore storage errors
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main
        className="relative flex flex-1 flex-col lg:flex-row"
        style={{
          backgroundImage: `url("/images/background.jpg")`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
      >
        {/* Left panel: 2D Editor */}
        <div className="flex flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r lg:border-border/40">
          {/* Toolbar + Canvas area */}
          <div className="flex flex-1 flex-col md:flex-row">
            {/* Toolbar - horizontal on mobile, vertical on desktop - compact */}
            <div className="flex shrink-0 items-start justify-center border-b border-border/40 p-1.5 md:items-start md:border-b-0 md:border-r md:border-border/40 md:p-2">
              <Toolbar
                onImageUpload={handleImageUpload}
                onAddText={handleAddText}
                onUpdateSelectedTextStyle={handleUpdateSelectedTextStyle}
                onAddUploadedImage={handleAddUploadedImage}
                onRemoveUploadedImage={handleRemoveUploadedImage}
                uploadedImages={uploadedImages}
                partColors={partColors}
                onPartColorChange={handlePartColorChange}
                onLastFontFamilyChange={onLastFontFamilyChange}
                onApplyStripedDesign={handleApplyStripedDesign}
                initialStripedDesign={stripedDesign}
              />
            </div>

            {/* Canvas editor - takes up more space */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {isPersistenceReady ? (
                <FabricEditor
                  key={fabricEditorRevision}
                  activeView={activeView}
                  restoreRevision={fabricEditorRestoreRevision}
                  onCanvasReady={handleCanvasReady}
                  onCanvasUpdate={handleCanvasUpdate}
                  initialViewObjects={initialViewObjects}
                  onViewObjectsChange={handleViewObjectsChange}
                  onGlobalUndo={handleUnifiedUndo}
                  onGlobalRedo={handleUnifiedRedo}
                  canGlobalUndo={canUnifiedUndo}
                  canGlobalRedo={canUnifiedRedo}
                  onCanvasStateChange={scheduleCanvasHistoryRecord}
                  lastFontFamily={lastFontFamilyRef.current}
                  onLastFontFamilyChange={onLastFontFamilyChange}
                  globalHistoryActionAt={globalHistoryActionAt}
                  historyRestoreAt={historyRestoreTick}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
                    <span className="text-sm text-muted-foreground">Restaurando diseño...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Template selector buttons - below canvas */}
          <div className="border-t border-border/40 bg-card/60 px-3 py-3 backdrop-blur-sm">
            <TemplateSelector activeView={activeView} onViewChange={setActiveView} />
          </div>
        </div>

        {/* Right panel: 3D Preview + Action buttons */}
        <div className="flex flex-col lg:w-[380px] xl:w-[440px]">
          {/* 3D viewer with background controls */}
          <div className="relative flex-1 flex flex-col" style={{ minHeight: 320 }}>
            {/* Tooltip for 3D interaction info */}
            <div className="absolute top-2 right-2 z-10">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="select-none rounded-full p-1 transition-colors hover:bg-black/10" tabIndex={-1} onDragStart={(e) => e.preventDefault()}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                      <NextImage
                        src="/images/icon-rotate.png"
                        alt="Información del modelo 3D"
                        width={20}
                        height={20}
                        draggable={false}
                        className="pointer-events-none select-none"
                      />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Este es un modelo 3D interactivo. Usa el ratón para rotar y zoom.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="relative flex-1">
              <TShirtPreview3D bodyColor={bodyColor} textureCanvas={textureCanvas} textureRevision={textureRevision} />
            </div>

            {/* 3D Background Color Control */}
            <div className="border-t border-border/40 bg-card/70 backdrop-blur-sm p-3">
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Color de fondo</span>
                  <label className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border">
                    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: bodyColor }} />
                    <input
                      type="color"
                      value={bodyColor}
                      onChange={(e) => setBodyColor(e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </label>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="border-t border-border/40 p-4">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowResetConfirm(true)}
                  className="flex-1 rounded-lg bg-purple-200 hover:bg-purple-300 py-3 text-base font-bold tracking-wide text-gray-900 transition-colors"
                >
                  Deshacer todo
                </button>
                <button 
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex-1 rounded-lg bg-purple-200 hover:bg-purple-300 py-3 text-base font-bold tracking-wide text-gray-900 transition-colors"
                >
                  Cancelar
                </button>
              </div>
              <button 
                onClick={() => setShowSaveConfirm(true)}
                className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 py-3 text-base font-bold tracking-wide text-white transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle className="text-xl font-bold text-foreground">¿Deseas resetear tu diseño?</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                Esta acción borrará todos los cambios realizados y <span className="font-semibold text-foreground">no se puede deshacer</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <div className="flex flex-col gap-2 sm:gap-3 mt-6">
            <AlertDialogAction 
              onClick={handleResetAllChanges}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 font-semibold"
            >
              Confirmar Reset
            </AlertDialogAction>
            <AlertDialogCancel className="text-gray-600 hover:text-gray-700 rounded-lg py-2.5 font-semibold border-0">
              Cancelar
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 mb-4">
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle className="text-xl font-bold text-foreground">¿Deseas salir sin guardar?</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                Los cambios que hayas realizado en esta sesión <span className="font-semibold text-foreground">no serán guardados</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <div className="flex flex-col gap-2 sm:gap-3 mt-6">
            <AlertDialogAction 
              onClick={() => {
                setShowCancelConfirm(false)
                // Aquí puedes agregar la lógica para volver atrás
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg py-2.5 font-semibold"
            >
              Salir sin guardar
            </AlertDialogAction>
            <AlertDialogCancel className="text-gray-600 hover:text-gray-700 rounded-lg py-2.5 font-semibold border-0">
              Volver al Editor
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
              <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle className="text-xl font-bold text-foreground">¿Guardar los cambios?</AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
                Se guardarán todos los cambios que has realizado en tu diseño personalizado.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <div className="flex flex-col gap-2 sm:gap-3 mt-6">
            <AlertDialogAction 
              onClick={() => {
                setShowSaveConfirm(false)
                // Aquí puedes agregar la lógica para guardar
              }}
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 font-semibold"
            >
              Guardar Cambios
            </AlertDialogAction>
            <AlertDialogCancel className="text-gray-600 hover:text-gray-700 rounded-lg py-2.5 font-semibold border-0">
              Continuar Editando
            </AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />

      <AlertDialog open={showIntroModal} onOpenChange={(open) => {
        if (!open) handleCloseIntroModal()
      }}>
        <AlertDialogContent className="max-w-md">
          <div className="flex flex-col gap-3">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-foreground">
                Bienvenido al personalizador
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Para obtener la mejor calidad en tus diseños, usa imágenes en formato PNG (preferido) o JPG.
                Recomendamos archivos de alta resolución, con fondo transparente para logos, y evitar capturas borrosas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end">
              <AlertDialogAction onClick={handleCloseIntroModal} className="bg-purple-600 hover:bg-purple-700 text-white">
                Entendido
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
