"use client"

import Image from "next/image"

export type TemplateView = "frente" | "espalda" | "mangas"

interface TemplateSelectorProps {
  activeView: TemplateView
  onViewChange: (view: TemplateView) => void
}

const templates: { id: TemplateView; label: string; image: string }[] = [
  { id: "frente", label: "FRENTE", image: "/images/frente.png" },
  { id: "espalda", label: "ESPALDA", image: "/images/espalda.png" },
  { id: "mangas", label: "MANGAS", image: "/images/mangas.png" },
]

export function TemplateSelector({ activeView, onViewChange }: TemplateSelectorProps) {
  return (
    <div className="flex items-center justify-end gap-6" style={{ marginRight: "0px" }}>
      <div className="flex items-center gap-4" style={{ marginRight: "290px" }}>
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => onViewChange(template.id)}
            className={`flex select-none flex-col items-center gap-2 rounded-2xl p-3 transition-all ${
              activeView === template.id
                ? "ring-3 ring-purple-600 bg-white/10"
                : "opacity-60 hover:opacity-100"
            }`}
            onDragStart={(e) => e.preventDefault()}
          >
            <div className="relative h-16 w-14">
              <Image
                src={template.image}
                alt={template.label}
                fill
                draggable={false}
                className="pointer-events-none select-none object-contain"
              />
            </div>
            <span className="text-xs font-bold tracking-wider text-foreground">
              {template.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
