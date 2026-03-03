"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Mail, Lock } from "lucide-react"

const API_URL = "https://api-darklion.onrender.com"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {}
    if (!email.trim()) {
      newErrors.email = "El correo es obligatorio."
    } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim())) {
      newErrors.email = "El correo no tiene un formato válido."
    }
    if (!password) {
      newErrors.password = "La contraseña es obligatoria."
    } else if (password.length < 4) {
      newErrors.password = "La contraseña debe tener al menos 4 caracteres."
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    setErrors({})

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrors({ general: "Correo o contraseña incorrectos." })
        } else {
          const body = await res.text().catch(() => "")
          setErrors({ general: body || `Error del servidor (${res.status})` })
        }
        setIsLoading(false)
        return
      }

      const data = await res.json()
      localStorage.setItem("darklion_token", data.token)
      localStorage.setItem("darklion_user", JSON.stringify(data.user))
      router.push("/")
    } catch {
      setErrors({ general: "No se pudo conectar al servidor. Intenta de nuevo." })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4 overflow-hidden" style={{ backgroundColor: "#000000" }}>
      {/* Force input styles in production */}
      <style>{`
        .login-input::placeholder { color: rgba(255,255,255,0.4); }
        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 30px #555555 inset !important;
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff;
        }
      `}</style>
      {/* Ambient light effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-left pink glow */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#E71D73]/20 blur-[120px] animate-pulse" />
        {/* Bottom-right cyan glow */}
        <div className="absolute -bottom-40 -right-32 w-[500px] h-[500px] rounded-full bg-[#66C1C6]/20 blur-[120px] animate-pulse [animation-delay:1s]" />
        {/* Center purple glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#6122A9]/15 blur-[140px]" />
        {/* Extra subtle accents */}
        <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-[#E71D73]/10 blur-[100px] animate-pulse [animation-delay:2s]" />
        <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] rounded-full bg-[#66C1C6]/10 blur-[100px] animate-pulse [animation-delay:0.5s]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="/images/logo.png"
            alt="Dark Lion Logo"
            className="h-20 md:h-28"
          />
        </div>

        {/* Card */}
        <div className="bg-[#444444] rounded-2xl p-6 md:p-8 shadow-2xl border border-[#555555]">
          <h1
            className="text-2xl md:text-3xl font-black text-white text-center mb-2 uppercase tracking-wide"
            style={{ fontFamily: "var(--font-chakra-petch), sans-serif" }}
          >
            Iniciar Sesión
          </h1>
          <p className="text-white/50 text-center text-sm mb-6">
            Ingresa tus credenciales para acceder al panel
          </p>

          {/* General error */}
          {errors.general && (
            <div className="bg-red-500/20 border border-red-400/50 rounded-lg px-4 py-3 mb-4">
              <p className="text-red-300 text-sm text-center">{errors.general}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-white text-sm font-semibold mb-1 block">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setErrors((prev) => ({ ...prev, email: undefined, general: undefined }))
                  }}
                  placeholder="correo@ejemplo.com"
                  className={`login-input w-full pl-10 pr-4 py-3 rounded-lg outline-none transition-all appearance-none ${
                    errors.email
                      ? "border-2 border-red-400 focus:border-red-400"
                      : "border border-[#888888]/30 focus:border-[#66C1C6]"
                  }`}
                  style={{ backgroundColor: "#555555", color: "#ffffff", colorScheme: "dark" }}
                />
              </div>
              {errors.email && <p className="text-sm text-red-400 mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="text-white text-sm font-semibold mb-1 block">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrors((prev) => ({ ...prev, password: undefined, general: undefined }))
                  }}
                  placeholder="••••••••"
                  className={`login-input w-full pl-10 pr-12 py-3 rounded-lg outline-none transition-all appearance-none ${
                    errors.password
                      ? "border-2 border-red-400 focus:border-red-400"
                      : "border border-[#888888]/30 focus:border-[#66C1C6]"
                  }`}
                  style={{ backgroundColor: "#555555", color: "#ffffff", colorScheme: "dark" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-red-400 mt-1">{errors.password}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#4C2C84] text-white font-bold rounded-full hover:bg-[#6A29B5] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isLoading && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {isLoading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6">
          Dark Lion &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
