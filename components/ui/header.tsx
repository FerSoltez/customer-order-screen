"use client"

import Image from "next/image"
import { ChevronDown } from "lucide-react"

export function Header() {
  return (
    <header className="flex items-center justify-between bg-primary px-4 py-2 md:px-6">
      <div className="flex items-center gap-2">
        <Image
          src="/images/logo1.png"
          alt="Dark Lion Logo"
          width={160}
          height={48}
          className="h-10 w-auto md:h-12"
          priority
        />
      </div>
      <nav className="flex items-center gap-4 md:gap-6">
        <button className="text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:text-secondary md:text-base">
          INICIO
        </button>
        <button className="flex items-center gap-1 rounded-full border border-primary-foreground/40 px-3 py-1 text-sm font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-primary-foreground/10 md:px-4 md:text-base">
          NOSOTROS
          <ChevronDown className="h-4 w-4" />
        </button>
      </nav>
    </header>
  )
}
