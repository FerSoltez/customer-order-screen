import type React from "react"
import type { Metadata } from "next"
import { Poppins, Chakra_Petch, Montserrat } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra-petch",
})

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
})

export const metadata: Metadata = {
  title: "Dark Lion - Gestión de Pedidos",
  description: "Sistema de gestión de pedidos personalizados",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/Icono%20Pesta%C3%B1a.png" type="image/png" />
      </head>
      <body className={`font-sans antialiased ${chakraPetch.variable} ${montserrat.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
