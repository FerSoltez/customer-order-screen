"use client"

import { useState, useEffect } from "react"
import { Search, FileImage, FileText, Eye, CheckCircle, Clock, Trash2, X, Bell, Download, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { io } from "socket.io-client"

const API_URL = "https://api-darklion.onrender.com"

interface ApiOrder {
  id_design: number
  name: string
  phone_number: string | null
  email: string
  created_at: string
  status: string
  document_url: string
}

interface Order {
  id: string
  id_design: number
  nombre: string
  telefono: string
  email: string
  date: string
  status: "pendiente" | "en_revision" | "aprobado"
  image?: string
  document_url?: string
}

function mapApiStatus(status: string): Order["status"] {
  switch (status) {
    case "pending":
      return "pendiente"
    case "in_review":
      return "en_revision"
    case "approved":
      return "aprobado"
    default:
      return "pendiente"
  }
}

function mapApiOrder(apiOrder: ApiOrder): Order {
  return {
    id: `#ORD-${apiOrder.id_design}`,
    id_design: apiOrder.id_design,
    nombre: apiOrder.name,
    telefono: apiOrder.phone_number || "Sin teléfono",
    email: apiOrder.email,
    date: apiOrder.created_at,
    status: mapApiStatus(apiOrder.status),
    document_url: apiOrder.document_url,
  }
}

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [statusFilter, setStatusFilter] = useState<Order["status"] | "all">("all")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // 1. Cargar pedidos existentes vía REST con reintentos
    const fetchOrders = async (retries = 3): Promise<void> => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(`${API_URL}/api/designs/orders`, {
            method: "GET",
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data: ApiOrder[] = await res.json()
          if (!cancelled) {
            const mapped = data.map(mapApiOrder)
            setOrders(mapped)
            if (mapped.length > 0) setSelectedOrder(mapped[0])
            setFetchError(null)
          }
          return
        } catch (err) {
          console.warn(`Intento ${i + 1}/${retries} falló:`, err)
          if (i < retries - 1) {
            // Esperar antes de reintentar (2s, 4s)
            await new Promise((r) => setTimeout(r, (i + 1) * 2000))
          } else if (!cancelled) {
            setFetchError("No se pudo conectar al servidor. El servidor puede estar iniciando, intenta recargar en unos segundos.")
          }
        }
      }
    }

    fetchOrders().finally(() => {
      if (!cancelled) setIsLoading(false)
    })

    // 2. Conectar al WebSocket para recibir nuevos pedidos en tiempo real
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })

    socket.on("connect", () => {
      console.log("Conectado al WebSocket:", socket.id)
    })

    socket.on("connect_error", (err) => {
      console.warn("WebSocket error:", err.message)
    })

    socket.on("new_order", (newOrder: ApiOrder) => {
      const mapped = mapApiOrder(newOrder)
      setOrders((prev) => [mapped, ...prev])
    })

    // 3. Limpiar al desmontar
    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [])

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id_design.toString().includes(searchTerm)
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    pendiente: orders.filter((o) => o.status === "pendiente").length,
    en_revision: orders.filter((o) => o.status === "en_revision").length,
    aprobado: orders.filter((o) => o.status === "aprobado").length,
  }

  const getStatusBadge = (status: Order["status"]) => {
    const styles = {
      pendiente: "bg-[#66C1C6] text-white hover:bg-[#66C1C6]",
      en_revision: "bg-[#6A29B5] text-white hover:bg-[#6A29B5]",
      aprobado: "bg-[#E71D73] text-white hover:bg-[#E71D73]",
    }
    const labels = {
      pendiente: "Pendientes",
      en_revision: "En revision",
      aprobado: "Aprobado",
    }
    return <Badge className={`${styles[status]} font-medium px-4 py-1 rounded-full`}>{labels[status]}</Badge>
  }

  const changeStatus = (orderId: string, idDesign: number, newStatus: Order["status"]) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id_design === idDesign ? { ...order, status: newStatus } : order
      )
    )
    if (selectedOrder?.id_design === idDesign) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null))
    }
  }

  const handleDeleteClick = (order: Order) => {
    setOrderToDelete(order)
    setShowDeleteModal(true)
  }

  const confirmDelete = () => {
    if (orderToDelete) {
      setOrders((prev) => prev.filter((o) => o.id_design !== orderToDelete.id_design))
      if (selectedOrder?.id_design === orderToDelete.id_design) {
        setSelectedOrder(null)
      }
      setShowDeleteModal(false)
      setOrderToDelete(null)
    }
  }

  const handleStatusFilterClick = (status: Order["status"]) => {
    setStatusFilter((prev) => (prev === status ? "all" : status))
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Header */}
      <header className="bg-[#4C2C84] px-4 py-3 md:px-8 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <img src="/images/logo.png" alt="Dark Lion Logo" className="h-10 md:h-14 flex-shrink-0" />

          {/* Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#888888] h-4 w-4" />
            <Input
              placeholder="Buscar Pedido..."
              className="pl-10 w-full bg-white rounded-full border-0 text-[#000000] placeholder:text-[#888888]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Bell icon */}
          <button className="text-white hover:text-[#66C1C6] transition-colors flex-shrink-0" aria-label="Notificaciones">
            <Bell className="h-6 w-6" />
          </button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Title */}
        <h1 className="text-2xl md:text-4xl font-black text-white mb-6 text-center uppercase tracking-wide font-[family-name:var(--font-chakra-petch)]">
          Gestion de Pedidos Personalizados
        </h1>

        {/* Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => handleStatusFilterClick("pendiente")}
            className={`bg-[#444444] rounded-full py-3 px-6 flex items-center justify-center gap-3 transition-all hover:bg-[#555555] hover:scale-[1.02] ${statusFilter === "pendiente" ? "ring-2 ring-[#66C1C6]" : ""}`}
          >
            <Clock className="h-5 w-5 text-white" />
            <span className="text-lg md:text-xl font-bold text-white" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>Pendientes: {statusCounts.pendiente}</span>
          </button>
          <button
            onClick={() => handleStatusFilterClick("en_revision")}
            className={`bg-[#444444] rounded-full py-3 px-6 flex items-center justify-center gap-3 transition-all hover:bg-[#555555] hover:scale-[1.02] ${statusFilter === "en_revision" ? "ring-2 ring-[#66C1C6]" : ""}`}
          >
            <Eye className="h-5 w-5 text-white" />
            <span className="text-lg md:text-xl font-bold text-white" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>En revision: {statusCounts.en_revision}</span>
          </button>
          <button
            onClick={() => handleStatusFilterClick("aprobado")}
            className={`bg-[#444444] rounded-full py-3 px-6 flex items-center justify-center gap-3 transition-all hover:bg-[#555555] hover:scale-[1.02] ${statusFilter === "aprobado" ? "ring-2 ring-[#66C1C6]" : ""}`}
          >
            <CheckCircle className="h-5 w-5 text-white" />
            <span className="text-lg md:text-xl font-bold text-white" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>Aprobados: {statusCounts.aprobado}</span>
          </button>
        </div>

        {/* Active Filter Indicator */}
        {statusFilter !== "all" && (
          <div className="mb-4 flex items-center justify-center gap-2">
            <span className="text-white font-semibold">
              Filtro activo: {statusFilter === "pendiente" ? "Pendientes" : statusFilter === "en_revision" ? "En revision" : "Aprobados"}
            </span>
            <button onClick={() => setStatusFilter("all")} className="text-[#66C1C6] hover:text-[#88d8dc] underline text-sm">
              Limpiar filtro
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders Table */}
          <div className="lg:col-span-2 bg-[#444444] rounded-2xl p-4 md:p-6">
            <h2 className="text-xl font-bold text-white mb-4 text-center" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>Pedidos Recientes</h2>
            <div className="w-full h-px bg-white mb-4" />

            {/* Loading / Error states */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent mb-3" />
                <p className="text-white">Cargando pedidos...</p>
                <p className="text-white/50 text-sm mt-1">El servidor puede tardar unos segundos en responder</p>
              </div>
            )}
            {fetchError && !isLoading && (
              <div className="text-center py-8">
                <p className="text-red-400 mb-3">{fetchError}</p>
                <Button
                  className="bg-[#4C2C84] text-white hover:bg-[#6A29B5] rounded-full"
                  onClick={() => window.location.reload()}
                >
                  Reintentar
                </Button>
              </div>
            )}

            {!isLoading && !fetchError && (
            <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white">
                    <th className="text-center py-3 px-4 text-white font-semibold text-sm">ID Pedido</th>
                    <th className="text-center py-3 px-4 text-white font-semibold text-sm">Nombre</th>
                    <th className="text-center py-3 px-4 text-white font-semibold text-sm">Fecha</th>
                    <th className="text-center py-3 px-4 text-white font-semibold text-sm">Estado</th>
                    <th className="text-center py-3 px-4 text-white font-semibold text-sm">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id_design}
                      className={`border-b border-white cursor-pointer transition-colors hover:bg-[#555555] ${selectedOrder?.id_design === order.id_design ? "bg-[#555555]" : ""}`}
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="py-4 px-4 text-white font-medium text-center font-[family-name:var(--font-montserrat)]">{order.id}</td>
                      <td className="py-4 px-4 text-center text-white font-[family-name:var(--font-montserrat)]">{order.nombre}</td>
                      <td className="py-4 px-4 text-white text-center font-[family-name:var(--font-montserrat)]">{order.date}</td>
                      <td className="py-4 px-4 text-center">{getStatusBadge(order.status)}</td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteClick(order)
                            }}
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-[#66C1C6] hover:text-[#88d8dc] hover:bg-[#66C1C6]/10 bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedOrder(order)
                            }}
                          >
                            <Pencil className="h-5 w-5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id_design}
                  className={`bg-[#555555] rounded-xl p-4 cursor-pointer transition-all ${selectedOrder?.id_design === order.id_design ? "ring-2 ring-[#66C1C6]" : ""}`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-white">{order.id}</span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(order.status)}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteClick(order)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-white font-medium">{order.nombre}</p>
                  <p className="text-sm text-white mt-1">{order.date}</p>
                </div>
              ))}
            </div>
            </>
            )}
          </div>
          <div className="bg-[#444444] rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>DETALLES</h3>
              {selectedOrder && <span className="text-white font-semibold" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>{selectedOrder.id} (ID: {selectedOrder.id_design})</span>}
            </div>

            {selectedOrder ? (
              <div className="space-y-4">
                {/* Order Image */}
                <div className="flex justify-center">
                  <img
                    src={selectedOrder.image || "/placeholder.svg"}
                    alt="Product preview"
                    className="w-full max-w-[200px] h-auto aspect-square object-cover rounded-lg border border-[#888888]/20"
                  />
                </div>

                {/* Download Buttons */}
                <div className="space-y-2">
                  {selectedOrder.document_url && (
                    <a
                      href={selectedOrder.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-between bg-[#555555] rounded-lg px-4 py-3 hover:bg-[#666666] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-white" />
                        <span className="text-white text-sm font-[family-name:var(--font-montserrat)]">{selectedOrder.nombre.replace(/ /g, "")}.xlsx</span>
                      </div>
                      <Download className="h-4 w-4 text-white" />
                    </a>
                  )}
                </div>

                {/* Contact Info */}
                <div className="bg-[#555555] rounded-lg p-4 text-sm space-y-1 font-[family-name:var(--font-montserrat)]">
                  <p className="text-white">
                    <span className="font-bold">NOMBRE:</span>
                  </p>
                  <p className="text-white">{selectedOrder.nombre}</p>
                  <p className="text-white mt-2">
                    <span className="font-bold">TELEFONO</span>
                  </p>
                  <p className="text-white">{selectedOrder.telefono}</p>
                  <p className="text-white mt-2">
                    <span className="font-bold">CORREO:</span>{" "}
                    <a href={`mailto:${selectedOrder.email}`} className="text-[#66C1C6] underline">
                      {selectedOrder.email}
                    </a>
                  </p>
                </div>

                {/* Status Change Buttons */}
                <div className="space-y-2">
                  <Button
                    className="w-full bg-[#66C1C6] text-white hover:bg-[#55b0b5] rounded-full font-semibold font-[family-name:var(--font-montserrat)]"
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.id_design, "pendiente")}
                    disabled={selectedOrder.status === "pendiente"}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Pendientes
                  </Button>
                  <Button
                    className="w-full bg-[#743EB3] text-white hover:bg-[#6A29B5] rounded-full font-semibold font-[family-name:var(--font-montserrat)]"
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.id_design, "en_revision")}
                    disabled={selectedOrder.status === "en_revision"}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {"En revision"}
                  </Button>
                  <Button
                    className="w-full bg-[#E71D73] text-white hover:bg-[#d01a68] rounded-full font-semibold font-[family-name:var(--font-montserrat)]"
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.id_design, "aprobado")}
                    disabled={selectedOrder.status === "aprobado"}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Aprobado
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-white py-8">
                <p>Selecciona un pedido para ver los detalles</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && orderToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#444444] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#888888]/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Confirmar Eliminacion</h3>
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setOrderToDelete(null)
                }}
                className="text-white hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-white">
                {"Estas seguro de que deseas eliminar el pedido "}
                <span className="font-bold text-white">{orderToDelete.id}</span>
                {" de "}
                <span className="font-bold text-white">{orderToDelete.nombre}</span>?
              </p>
              <p className="text-sm text-white/70 mt-2">Esta accion no se puede deshacer.</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-[#888888]/30 text-white hover:bg-[#555555] bg-transparent"
                onClick={() => {
                  setShowDeleteModal(false)
                  setOrderToDelete(null)
                }}
              >
                Cancelar
              </Button>
              <Button className="flex-1 bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
