"use client"

import { Upload, ImageIcon, Type, Palette, X, ChevronDown, ChevronUp } from "lucide-react"
import { useRef, useState, useEffect } from "react"
import Image from "next/image"
import { ColorPalette } from "./color-palette"

interface UploadedImage {
  id: string
  name: string
  dataUrl: string
}

interface ToolbarProps {
  onImageUpload: (file: File) => void
  onAddText: (text: string, fontFamily: string, color: string) => void
  onUpdateSelectedTextStyle: (fontFamily: string, color: string) => boolean
  onAddUploadedImage: (dataUrl: string) => void
  onRemoveUploadedImage?: (id: string) => void
  uploadedImages: UploadedImage[]
  partColors: {
    frente: string
    espalda: string
    manga_izquierda: string
    manga_derecha: string
    cuello: string
  }
  onPartColorChange: (part: "frente" | "espalda" | "manga_izquierda" | "manga_derecha" | "cuello", color: string) => void
}

const FONT_OPTIONS = [
  { label: "CHAKRA PETCH", value: "'Chakra Petch', sans-serif" },
  { label: "ARBORIA", value: "'Arboria', sans-serif" },
  { label: "MONTSERRAT", value: "'Montserrat', sans-serif" },
]

const MAX_TEXT_LENGTH = 15

export function Toolbar({ onImageUpload, onAddText, onUpdateSelectedTextStyle, onAddUploadedImage, onRemoveUploadedImage, uploadedImages, partColors, onPartColorChange }: ToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [activePanel, setActivePanel] = useState<"subidos" | "texto" | "partes" | null>(null)
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({
    frente: false,
    espalda: false,
    manga_izquierda: false,
    manga_derecha: false,
    cuello: false,
  })
  const [textInput, setTextInput] = useState("Tu texto")
  const [selectedFont, setSelectedFont] = useState(FONT_OPTIONS[0].value)
  const [textColor, setTextColor] = useState("#1a1a2e")
  const [textEditMessage, setTextEditMessage] = useState<string | null>(null)

  const togglePanel = (panel: "subidos" | "texto" | "partes") => {
    setActivePanel(activePanel === panel ? null : panel)
  }

  const togglePart = (part: string) => {
    setExpandedParts((prev) => ({ ...prev, [part]: !prev[part] }))
  }

  // Close panel when clicking outside toolbar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActivePanel(null)
      }
    }

    if (activePanel) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [activePanel])

  return (
    <div className="relative flex flex-row items-start gap-0 md:flex-col" ref={toolbarRef}>
      {/* Main toolbar buttons */}
      <div className="flex flex-row items-center gap-2 rounded-xl bg-card p-2 shadow-lg md:flex-col md:gap-3 md:p-3">
        {/* Subidos */}
        <button
          onClick={() => togglePanel("subidos")}
          className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${
            activePanel === "subidos" ? "bg-secondary" : "hover:bg-secondary/60"
          }`}
          title="Archivos subidos"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary md:h-12 md:w-12">
            <Upload className="h-5 w-5 text-primary md:h-6 md:w-6" />
          </div>
          <span className="text-[10px] font-medium text-foreground md:text-xs">Subidos</span>
        </button>

        {/* Imagen */}
        <button
          onClick={() => imageInputRef.current?.click()}
          className="flex flex-col items-center gap-1 rounded-lg p-2 transition-colors hover:bg-secondary/60"
          title="Subir imagen"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary md:h-12 md:w-12">
            <ImageIcon className="h-5 w-5 text-primary md:h-6 md:w-6" />
          </div>
          <span className="text-[10px] font-medium text-foreground md:text-xs">Imagen</span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImageUpload(file)
            e.target.value = ""
          }}
        />

        {/* Texto */}
        <button
          onClick={() => togglePanel("texto")}
          className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${
            activePanel === "texto" ? "bg-secondary" : "hover:bg-secondary/60"
          }`}
          title="Agregar texto"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary md:h-12 md:w-12">
            <Type className="h-5 w-5 text-primary md:h-6 md:w-6" />
          </div>
          <span className="text-[10px] font-medium text-foreground md:text-xs">Texto</span>
        </button>

        {/* Partes */}
        <button
          onClick={() => togglePanel("partes")}
          className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${
            activePanel === "partes" ? "bg-secondary" : "hover:bg-secondary/60"
          }`}
          title="Editar color de partes"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary md:h-12 md:w-12">
            <Palette className="h-5 w-5 text-primary md:h-6 md:w-6" />
          </div>
          <span className="text-[10px] font-medium text-foreground md:text-xs">Partes</span>
        </button>
      </div>

      {/* Expandable panels */}
      {activePanel && (
        <div className="absolute left-0 top-full z-30 mt-2 flex max-h-[340px] w-72 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl md:left-full md:top-0 md:ml-3 md:mt-0 md:max-h-[500px] md:w-80 sm:w-screen sm:left-0 sm:right-0 sm:mx-auto sm:max-w-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">
              {activePanel === "subidos"
                ? "Archivos Subidos"
                : activePanel === "texto"
                  ? "Agregar Texto"
                  : "Color de Partes"}
            </h3>
            <button
              onClick={() => setActivePanel(null)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pr-6">
            {activePanel === "subidos" && (
              <div className="flex flex-col gap-3">
                {uploadedImages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay imagenes subidas. Usa el boton Imagen para subir archivos.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {uploadedImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                        title={img.name}
                      >
                        <button
                          onClick={() => {
                            onAddUploadedImage(img.dataUrl)
                            setActivePanel(null)
                          }}
                          className="absolute inset-0 h-full w-full transition-all hover:ring-2 hover:ring-primary"
                        >
                          <Image
                            src={img.dataUrl}
                            alt={img.name}
                            fill
                            className="object-cover"
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveUploadedImage?.(img.id)
                          }}
                          className="absolute right-1 top-1 rounded-full bg-red-500/80 p-1 opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                          title="Eliminar imagen"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activePanel === "texto" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="text-input" className="text-xs font-medium text-muted-foreground">
                    Texto
                  </label>
                  <input
                    id="text-input"
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                    maxLength={MAX_TEXT_LENGTH}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Escribe tu texto..."
                  />
                  <span className="text-[11px] text-muted-foreground">{textInput.length}/{MAX_TEXT_LENGTH}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="font-select" className="text-xs font-medium text-muted-foreground">
                    Fuente
                  </label>
                  <select
                    id="font-select"
                    value={selectedFont}
                    onChange={(e) => setSelectedFont(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="text-color" className="text-xs font-medium text-muted-foreground">
                    Color del texto
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-border">
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: textColor }}
                      />
                      <input
                        id="text-color"
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">{textColor}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p
                    className="truncate text-center text-base"
                    style={{ fontFamily: selectedFont, color: textColor }}
                  >
                    {textInput || "Vista previa"}
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (textInput.trim()) {
                      onAddText(textInput.slice(0, MAX_TEXT_LENGTH), selectedFont, textColor)
                      setActivePanel(null)
                    }
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Agregar al lienzo
                </button>

                <button
                  onClick={() => {
                    const updated = onUpdateSelectedTextStyle(selectedFont, textColor)
                    setTextEditMessage(updated ? "Estilo aplicado al texto seleccionado" : "Selecciona un texto para editar")
                  }}
                  className="rounded-lg border border-primary bg-card px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-secondary"
                >
                  Aplicar al texto seleccionado
                </button>

                {textEditMessage && (
                  <p className="text-xs text-muted-foreground">{textEditMessage}</p>
                )}
              </div>
            )}

            {activePanel === "partes" && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => togglePart("frente")}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: partColors.frente }}
                    />
                    Frente
                  </span>
                  {expandedParts.frente ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {expandedParts.frente && (
                  <div className="px-2 pb-3">
                    <ColorPalette
                      selected={partColors.frente}
                      onSelect={(color) => onPartColorChange("frente", color)}
                    />
                  </div>
                )}

                <button
                  onClick={() => togglePart("espalda")}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: partColors.espalda }}
                    />
                    Espalda
                  </span>
                  {expandedParts.espalda ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {expandedParts.espalda && (
                  <div className="px-2 pb-3">
                    <ColorPalette
                      selected={partColors.espalda}
                      onSelect={(color) => onPartColorChange("espalda", color)}
                    />
                  </div>
                )}

                <button
                  onClick={() => togglePart("manga_izquierda")}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: partColors.manga_derecha }}
                    />
                    Manga Izquierda
                  </span>
                  {expandedParts.manga_izquierda ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {expandedParts.manga_izquierda && (
                  <div className="px-2 pb-3">
                    <ColorPalette
                      selected={partColors.manga_derecha}
                      onSelect={(color) => onPartColorChange("manga_derecha", color)}
                    />
                  </div>
                )}

                <button
                  onClick={() => togglePart("manga_derecha")}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: partColors.manga_izquierda }}
                    />
                    Manga Derecha
                  </span>
                  {expandedParts.manga_derecha ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {expandedParts.manga_derecha && (
                  <div className="px-2 pb-3">
                    <ColorPalette
                      selected={partColors.manga_izquierda}
                      onSelect={(color) => onPartColorChange("manga_izquierda", color)}
                    />
                  </div>
                )}

                <button
                  onClick={() => togglePart("cuello")}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                >
                  <span className="flex items-center gap-2">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: partColors.cuello }}
                    />
                    Cuello
                  </span>
                  {expandedParts.cuello ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {expandedParts.cuello && (
                  <div className="px-2 pb-3">
                    <ColorPalette
                      selected={partColors.cuello}
                      onSelect={(color) => onPartColorChange("cuello", color)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
