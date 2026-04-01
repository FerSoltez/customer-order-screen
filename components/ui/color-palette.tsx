"use client"

interface ColorPaletteProps {
  selected?: string
  onSelect: (color: string) => void
  label?: string
}

const PALETTE_COLORS = [
  // Fila 1 - Grises y neutrales
  "#FFFFFF",
  "#C8C8C8",
  "#969696",
  "#787878",
  "#505050",
  "#282828",
  "#E0E0E0",
  // Fila 2 - Rojos y vinos
  "#8B4545",
  "#B22222",
  "#DC143C",
  "#FA8072",
  "#FF8C69",
  "#FF6B6B",
  "#FF4444",
  // Fila 3 - Naranjas y amarillos
  "#FF7F50",
  "#FFA500",
  "#FFD700",
  "#FFE4B5",
  "#FFFF00",
  "#DDDD00",
  "#CCCC00",
  // Fila 4 - Verdes lima y verdes
  "#C8FF32",
  "#ADFF2F",
  "#98FB98",
  "#228B22",
  "#008080",
  "#48D1CC",
  "#20B2AA",
  // Fila 5 - Azules y teals
  "#1E90FF",
  "#87CEEB",
  "#191970",
  "#003366",
  "#4169E1",
  "#4682B4",
  "#000080",
  // Fila 6 - Púrpuras y pinks
  "#4B0082",
  "#8A2BE2",
  "#BA55D3",
  "#D8BFD8",
  "#FFC0CB",
  "#DB2777",
  "#FF1493",
]

export function ColorPalette({ selected, onSelect, label }: ColorPaletteProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-semibold text-foreground">{label}</label>}
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-7 md:gap-2">
        {PALETTE_COLORS.map((color) => (
          <button
            key={color}
            title={color}
            onClick={() => onSelect(color)}
            className={`
              h-7 w-7 sm:h-8 sm:w-8
              rounded
              border-2
              transition-all
              duration-200
              cursor-pointer
              hover:scale-110
              shadow-sm
              hover:shadow-md
              ${
                selected === color
                  ? "border-purple-600 ring-2 ring-purple-500"
                  : "border-gray-300 hover:border-gray-400"
              }
            `}
            style={{ backgroundColor: color }}
            aria-label={`Color ${color}`}
          />
        ))}
      </div>
      {selected && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1">
          <div
            className="h-6 w-6 rounded border border-border"
            style={{ backgroundColor: selected }}
          />
          <span className="text-xs text-muted-foreground">{selected}</span>
        </div>
      )}
    </div>
  )
}
