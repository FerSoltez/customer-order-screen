"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Header } from "@/components/ui/header"
import { Footer } from "@/components/ui/footer"
import { Toolbar } from "@/components/ui/toolbar"
import { FabricEditor } from "@/components/ui/fabric-editor"
import { TemplateSelector, type TemplateView } from "@/components/ui/template-selector"
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

// UV positions on the composite texture (normalized 0-1, from Blender UV map)
const UV_REGIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  frente:          { x: 0.0000, y: 0.1172, w: 0.50, h: 0.6527 },
  espalda:         { x: 0.50, y: 0.1172, w: 0.45, h: 0.7227 },
  manga_izquierda: { x: 0.000, y: 0.8008, w: 0.550, h: 0.15 },
  manga_derecha:   { x: 0.50, y: 0.8008, w: 0.40, h: 0.1592 },
}

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
// 8192 is stable without lag on color/image changes
const TEXTURE_SIZE = 8192

interface PartColors {
  frente: string
  espalda: string
  manga_izquierda: string
  manga_derecha: string
  cuello: string
}

interface PersistedPersonalizadorState {
  activeView?: TemplateView
  partColors?: PartColors
  uploadedImages?: UploadedImage[]
  viewObjects?: Record<string, string>
}

const STORAGE_KEY = "darklion-personalizador-3d-v1"
const DEFAULT_PART_COLORS: PartColors = {
  frente: "#ffffff",
  espalda: "#ffffff",
  manga_izquierda: "#ffffff",
  manga_derecha: "#ffffff",
  cuello: "#ffffff",
}

export default function PersonalizadorPage() {
  const [activeView, setActiveView] = useState<TemplateView>("frente")
  const [bodyColor, setBodyColor] = useState("#393d42")
  const [partColors, setPartColors] = useState<PartColors>(DEFAULT_PART_COLORS)
  const [canvasDataUrl, setCanvasDataUrl] = useState<string | undefined>()
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [initialViewObjects, setInitialViewObjects] = useState<Record<string, string>>({})
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const [persistTick, setPersistTick] = useState(0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null)
  const viewContentRef = useRef<Record<string, string>>({})
  const viewObjectsRef = useRef<Record<string, string>>({})
  const partColorsRef = useRef<PartColors>(partColors)
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const composeIdRef = useRef(0)

  useEffect(() => {
    document.title = "Dark Lion - Personalizador 3D"
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        setIsPersistenceReady(true)
        return
      }

      const parsed = JSON.parse(raw) as PersistedPersonalizadorState
      if (parsed.activeView) {
        setActiveView(parsed.activeView)
      }

      if (parsed.partColors) {
        setPartColors({ ...DEFAULT_PART_COLORS, ...parsed.partColors })
      }

      if (Array.isArray(parsed.uploadedImages)) {
        setUploadedImages(parsed.uploadedImages)
      }

      if (parsed.viewObjects && typeof parsed.viewObjects === "object") {
        viewObjectsRef.current = parsed.viewObjects
        setInitialViewObjects(parsed.viewObjects)
      }
    } catch {
      // ignore invalid saved state
    } finally {
      setIsPersistenceReady(true)
    }
  }, [])

  const handleCanvasReady = useCallback((canvas: unknown) => {
    fabricCanvasRef.current = canvas
  }, [])

  // Store compose function in ref to avoid dependency issues
  const composeUVTextureRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    // Only define composeUVTexture logic once on mount or activeView change
    composeUVTextureRef.current = async () => {
      const currentId = ++composeIdRef.current

      if (!compositeCanvasRef.current) {
        compositeCanvasRef.current = document.createElement("canvas")
        compositeCanvasRef.current.width = TEXTURE_SIZE
        compositeCanvasRef.current.height = TEXTURE_SIZE
      }

      const cvs = compositeCanvasRef.current
      const ctx = cvs.getContext("2d")
      if (!ctx) return

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

      // Load all per-view images
      const entries = Object.entries(viewContentRef.current).filter(([, url]) => !!url)
      const loaded: { view: string; img: HTMLImageElement }[] = []

      await Promise.all(
        entries.map(
          ([view, dataUrl]) =>
            new Promise<void>((resolve) => {
              const img = new Image()
              img.onload = () => {
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
      setCanvasDataUrl(cvs.toDataURL("image/png"))
    }
  }, [])

  const composeUVTexture = useCallback(() => {
    composeUVTextureRef.current()
  }, [])

  const handleCanvasUpdate = useCallback(
    (view: string, userContentDataUrl: string) => {
      viewContentRef.current[view] = userContentDataUrl
      setPersistTick((tick) => tick + 1)
      composeUVTexture()
    },
    []
  )

  const handleViewObjectsChange = useCallback((view: string, serializedObjects: string | null) => {
    if (serializedObjects) {
      viewObjectsRef.current[view] = serializedObjects
    } else {
      delete viewObjectsRef.current[view]
    }
    setPersistTick((tick) => tick + 1)
  }, [])

  const handlePartColorChange = useCallback((part: keyof PartColors, color: string) => {
    setPartColors((prev) => ({ ...prev, [part]: color }))
  }, [])

  useEffect(() => {
    partColorsRef.current = partColors
    // Recompose texture whenever colors change for real-time feedback
    const timeoutId = setTimeout(() => {
      composeUVTexture()
    }, 150) // Debounce rapid color changes (150ms = no lag)
    return () => clearTimeout(timeoutId)
  }, [partColors])

  useEffect(() => {
    if (!isPersistenceReady) return
    
    // Generate initial texture after persistence is ready
    composeUVTexture()
  }, [isPersistenceReady])

  useEffect(() => {
    if (!isPersistenceReady) return

    try {
      const payload: PersistedPersonalizadorState = {
        activeView,
        partColors,
        uploadedImages,
        viewObjects: viewObjectsRef.current,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore quota/storage errors
    }
  }, [isPersistenceReady, activeView, partColors, uploadedImages, persistTick])

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
      const dataUrl = e.target?.result as string
      // Save to uploaded images gallery
      setUploadedImages((prev) => [
        ...prev,
        { id: Date.now().toString(), name: file.name, dataUrl },
      ])
      // Add to canvas
      addImageToCanvas(dataUrl)
    }
    reader.readAsDataURL(file)
  }, [addImageToCanvas])

  const handleAddText = useCallback(async (text: string, fontFamily: string, color: string) => {
    const fabricModule = await import("fabric")
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const itext = new fabricModule.IText(text, {
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
    setUploadedImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleResetAllChanges = useCallback(() => {
    setPartColors({ ...DEFAULT_PART_COLORS })
    setUploadedImages([])
    viewObjectsRef.current = {}
    setInitialViewObjects({})
    setShowResetConfirm(false)

    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }

    window.location.reload()
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
              />
            </div>

            {/* Canvas editor - takes up more space */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {isPersistenceReady ? (
                <FabricEditor
                  activeView={activeView}
                  onCanvasReady={handleCanvasReady}
                  onCanvasUpdate={handleCanvasUpdate}
                  initialViewObjects={initialViewObjects}
                  onViewObjectsChange={handleViewObjectsChange}
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
                  <button className="p-1 rounded-full hover:bg-black/10 transition-colors" tabIndex={-1}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
                      <NextImage
                        src="/images/icon-rotate.png"
                        alt="Información del modelo 3D"
                        width={20}
                        height={20}
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
              <TShirtPreview3D bodyColor={bodyColor} textureUrl={canvasDataUrl} />
            </div>

            {/* 3D Background Color Control */}
            <div className="border-t border-border/40 bg-card/70 backdrop-blur-sm p-3">
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Color de fondo</span>
                  <div className="flex items-center gap-2">
                    <label className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border">
                      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: bodyColor }} />
                      <input
                        type="color"
                        value={bodyColor}
                        onChange={(e) => setBodyColor(e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <span className="text-[11px] text-muted-foreground">{bodyColor}</span>
                  </div>
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
              <AlertDialogTitle className="text-xl font-bold text-foreground">¿Deseas cancelar sin guardar?</AlertDialogTitle>
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
              Cancelar Sin Guardar
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
    </div>
  )
}
