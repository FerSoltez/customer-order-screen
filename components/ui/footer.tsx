"use client"

import Image from "next/image"
import { Instagram, Mail, MapPin } from "lucide-react"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .56.04.82.1v-3.5a6.37 6.37 0 0 0-.82-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.82a4.82 4.82 0 0 1-1-.13Z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-4 bg-primary px-4 py-4 md:flex-row md:justify-between md:px-8 md:py-3">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-bold tracking-widest text-primary-foreground md:text-base">
          DARK LION
        </span>
        <div className="h-px w-32 bg-primary-foreground/40" />
        <div className="flex items-center gap-3">
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-foreground/40 text-primary-foreground transition-colors hover:bg-primary-foreground/10" aria-label="Instagram">
            <Instagram className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-foreground/40 text-primary-foreground transition-colors hover:bg-primary-foreground/10" aria-label="Email">
            <Mail className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-foreground/40 text-primary-foreground transition-colors hover:bg-primary-foreground/10" aria-label="Facebook">
            <FacebookIcon className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-foreground/40 text-primary-foreground transition-colors hover:bg-primary-foreground/10" aria-label="TikTok">
            <TikTokIcon className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-foreground/40 text-primary-foreground transition-colors hover:bg-primary-foreground/10" aria-label="Ubicacion">
            <MapPin className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Image
          src="/images/logo1.png"
          alt="Dark Lion Logo"
          width={140}
          height={40}
          className="h-10 w-auto md:h-12"
        />
      </div>
    </footer>
  )
}
