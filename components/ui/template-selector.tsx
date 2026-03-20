"use client"

import Image from "next/image"
import { RotateCcw } from "lucide-react"

export type TemplateView = "frente" | "espalda" | "mangas"

interface TemplateSelectorProps {
  activeView: TemplateView
  onViewChange: (view: TemplateView) => void
  onReset?: () => void
}

const templates: { id: TemplateView; label: string; image: string }[] = [
  { id: "frente", label: "FRENTE", image: "/images/frente.png" },
  { id: "espalda", label: "ESPALDA", image: "/images/espalda.png" },
  { id: "mangas", label: "MANGAS", image: "/images/mangas.png" },
]

export function TemplateSelector({ activeView, onViewChange, onReset }: TemplateSelectorProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center justify-center gap-4 flex-1">
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onViewChange(template.id)}
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition-all ${
              activeView === template.id
                ? "ring-3 ring-purple-600 bg-white/10"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            <div className="relative h-16 w-14">
              <Image
                src={template.image}
                alt={template.label}
                fill
                className="object-contain"
              />
            </div>
            <span className="text-xs font-bold tracking-wider text-foreground">
              {template.label}
            </span>
          </button>
        ))}
      </div>

      {/* Reset button - compact */}
      {onReset && (
        <button
          onClick={onReset}
          className="ml-2 flex items-center justify-center px-3 py-2 rounded-lg border border-purple-600/30 bg-purple-600/10 hover:bg-purple-600/20 transition-colors"
          title="Resetear diseño"
        >
          <RotateCcw className="h-4 w-4 text-purple-600" />
        </button>
      )}
    </div>
  )
}
