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
  design_file_url?: string
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

interface AppNotification {
  id: number
  title: string
  body: string
  timestamp: Date
  read: boolean
}

function mapApiStatus(status: string): Order["status"] {
  switch (status.toLowerCase()) {
    case "pending":
    case "pendiente":
      return "pendiente"
    case "in_review":
    case "en_revision":
    case "en revision":
      return "en_revision"
    case "approved":
    case "aprobado":
      return "aprobado"
    default:
      return "pendiente"
  }
}

function mapStatusToApi(status: Order["status"]): string {
  switch (status) {
    case "pendiente":
      return "Pendiente"
    case "en_revision":
      return "En revision"
    case "aprobado":
      return "Aprobado"
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
    image: apiOrder.design_file_url?.trim() || undefined,
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
  const [showEditModal, setShowEditModal] = useState(false)
  const [orderToEdit, setOrderToEdit] = useState<Order | null>(null)
  const [editForm, setEditForm] = useState({ name: "", email: "", phone_number: "", status: "pendiente" as Order["status"] })
  const [isUpdating, setIsUpdating] = useState(false)
  const [editErrors, setEditErrors] = useState<{ name?: string; email?: string; phone_number?: string }>({})
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default")
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  const addNotification = (title: string, body: string) => {
    setNotifications((prev) => [
      { id: Date.now(), title, body, timestamp: new Date(), read: false },
      ...prev,
    ])
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  // Push notifications subscription
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifPermission("unsupported")
      return
    }

    setNotifPermission(Notification.permission)

    if (Notification.permission === "granted") {
      subscribeToPush()
    }
  }, [])

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js")
      const res = await fetch(`${API_URL}/api/push/vapid-public-key`)
      const { publicKey } = await res.json()
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })
      await fetch(`${API_URL}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      })
      console.log("Push notifications: suscrito correctamente")
    } catch (err) {
      console.warn("Push notifications: error al suscribir", err)
    }
  }

  const downloadImage = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.warn('Download failed, opening in new tab as fallback', err)
      window.open(url, '_blank')
    }
  }

  const handleNotificationClick = async () => {
    if (notifPermission === "default") {
      const perm = await Notification.requestPermission()
      setNotifPermission(perm)
      if (perm === "granted") {
        await subscribeToPush()
      }
    }
    setShowNotifPanel((prev) => !prev)
  }

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
      addNotification("Nuevo pedido", `Pedido #ORD-${newOrder.id_design} de ${newOrder.name}`)
    })

    // Pedido actualizado
    socket.on("update_order", (updatedOrder: ApiOrder) => {
      const mapped = mapApiOrder(updatedOrder)
      setOrders((prev) =>
        prev.map((o) => (o.id_design === mapped.id_design ? mapped : o))
      )
      setSelectedOrder((prev) =>
        prev && prev.id_design === mapped.id_design ? mapped : prev
      )
      addNotification("Pedido actualizado", `Pedido #ORD-${updatedOrder.id_design} - Estado: ${updatedOrder.status}`)
    })

    // 3. Limpiar al desmontar
    return () => {
      cancelled = true
      socket.disconnect()
    }
  }, [])

  const filteredOrders = orders.filter((order) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      order.id.toLowerCase().includes(search) ||
      order.nombre.toLowerCase().includes(search) ||
      order.email.toLowerCase().includes(search) ||
      order.id_design.toString().includes(search) ||
      order.date.toLowerCase().includes(search)
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
      pendiente: "Pendiente",
      en_revision: "En revision",
      aprobado: "Aprobado",
    }
    return <Badge className={`${styles[status]} font-medium px-4 py-1 rounded-full`}>{labels[status]}</Badge>
  }

  const patchOrder = async (idDesign: number, data: { status?: string; email?: string; name?: string; phone_number?: string }) => {
    // Intentar múltiples formatos de ruta
    const urls = [
      `${API_URL}/api/designs/${idDesign}`,
      `${API_URL}/api/designs/orders/${idDesign}`,
    ]
    
    for (const url of urls) {
      console.log("PATCH request:", url, data)
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
        if (res.status === 404) {
          console.warn(`404 en ${url}, probando siguiente...`)
          continue
        }
        if (!res.ok) {
          const errorBody = await res.text().catch(() => "")
          console.error(`PATCH failed: ${res.status}`, errorBody)
          throw new Error(`HTTP ${res.status}`)
        }
        const text = await res.text()
        return text ? JSON.parse(text) : null
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("HTTP")) throw err
        console.warn(`Error con ${url}:`, err)
        continue
      }
    }
    // Si ninguna ruta funciona, actualizar localmente
    console.warn("Ninguna ruta PATCH funcionó, actualizando localmente")
    return null
  }

  const changeStatus = async (orderId: string, idDesign: number, newStatus: Order["status"]) => {
    // Actualización optimista
    const previousOrders = [...orders]
    const previousSelected = selectedOrder
    
    setOrders((prev) =>
      prev.map((order) =>
        order.id_design === idDesign ? { ...order, status: newStatus } : order
      )
    )
    if (selectedOrder?.id_design === idDesign) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null))
    }

    try {
      await patchOrder(idDesign, { status: mapStatusToApi(newStatus) })
    } catch (err) {
      // Revertir si falla
      console.error("Error al cambiar estado:", err)
      setOrders(previousOrders)
      setSelectedOrder(previousSelected)
      alert("No se pudo actualizar el estado en el servidor.")
    }
  }

  const handleEditClick = (order: Order) => {
    setOrderToEdit(order)
    setEditForm({
      name: order.nombre,
      email: order.email,
      phone_number: order.telefono,
      status: order.status,
    })
    setEditErrors({})
    setShowEditModal(true)
  }

  const confirmEdit = async () => {
    if (!orderToEdit) return
    // Validaciones inline
    const errors: { name?: string; email?: string; phone_number?: string } = {}
    if (!editForm.name.trim()) {
      errors.name = "El nombre es obligatorio."
    }
    if (!editForm.email.trim()) {
      errors.email = "El correo es obligatorio."
    } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(editForm.email.trim())) {
      errors.email = "El correo no tiene un formato válido."
    }
    if (!editForm.phone_number.trim()) {
      errors.phone_number = "El teléfono es obligatorio."
    } else if (!/^\d+$/.test(editForm.phone_number.trim())) {
      errors.phone_number = "El teléfono solo debe contener números."
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors)
      return
    }

    setEditErrors({})
    setIsUpdating(true)
    try {
      await patchOrder(orderToEdit.id_design, {
        name: editForm.name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        status: mapStatusToApi(editForm.status),
      })
    } catch (err) {
      console.error("Error al editar pedido (API):", err)
    }
    // Actualizar localmente siempre
    const updatedOrder: Order = {
      ...orderToEdit,
      nombre: editForm.name,
      email: editForm.email,
      telefono: editForm.phone_number,
      status: editForm.status,
    }
    setOrders((prev) =>
      prev.map((o) => (o.id_design === orderToEdit.id_design ? updatedOrder : o))
    )
    if (selectedOrder?.id_design === orderToEdit.id_design) {
      setSelectedOrder(updatedOrder)
    }
    setShowEditModal(false)
    setOrderToEdit(null)
    setIsUpdating(false)
  }

  const handleDeleteClick = (order: Order) => {
    setOrderToDelete(order)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (orderToDelete) {
      try {
        const res = await fetch(`${API_URL}/api/designs/${orderToDelete.id_design}`, {
          method: "DELETE",
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setOrders((prev) => prev.filter((o) => o.id_design !== orderToDelete.id_design))
        if (selectedOrder?.id_design === orderToDelete.id_design) {
          setSelectedOrder(null)
        }
      } catch (err) {
        console.error("Error al eliminar pedido:", err)
        alert("No se pudo eliminar el pedido. Intenta de nuevo.")
      } finally {
        setShowDeleteModal(false)
        setOrderToDelete(null)
      }
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
          <div className="relative flex-shrink-0">
            <button
              className={`relative transition-colors ${
                notifPermission === "granted" ? "text-[#66C1C6]" : "text-white hover:text-[#66C1C6]"
              }`}
              aria-label="Notificaciones"
              onClick={handleNotificationClick}
            >
              <Bell className="h-6 w-6" />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold border-2 border-[#4C2C84]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              {unreadCount === 0 && notifPermission === "granted" && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-green-500 rounded-full border-2 border-[#4C2C84]" />
              )}
              {notifPermission === "default" && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-yellow-500 rounded-full border-2 border-[#4C2C84] animate-pulse" />
              )}
            </button>

            {/* Notification Panel */}
            {showNotifPanel && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
                <div className="absolute right-0 top-10 w-80 max-h-96 bg-[#333333] rounded-xl shadow-2xl border border-[#555555] z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#555555]">
                    <h4 className="text-white font-bold text-sm">Notificaciones</h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[#66C1C6] text-xs hover:underline"
                      >
                        Marcar como leídas
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto max-h-80">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="h-8 w-8 text-white/30 mx-auto mb-2" />
                        <p className="text-white/50 text-sm">No hay notificaciones</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 border-b border-[#444444] hover:bg-[#444444] transition-colors ${
                            !notif.read ? "bg-[#3a3a4a]" : ""
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!notif.read && (
                              <span className="h-2 w-2 bg-[#66C1C6] rounded-full mt-1.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-semibold">{notif.title}</p>
                              <p className="text-white/70 text-xs mt-0.5">{notif.body}</p>
                              <p className="text-white/40 text-xs mt-1">
                                {notif.timestamp.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
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
              Filtro activo: {statusFilter === "pendiente" ? "Pendiente" : statusFilter === "en_revision" ? "En revision" : "Aprobados"}
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
                              handleEditClick(order)
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
                  {selectedOrder.image ? (
                    <img
                      src={selectedOrder.image}
                      alt="Product preview"
                      className="w-full max-w-[300px] h-auto max-h-[400px] object-contain rounded-lg border border-[#888888]/20"
                    />
                  ) : (
                    <div className="w-full max-w-[200px] aspect-square rounded-lg border border-[#888888]/20 flex items-center justify-center bg-[#555555]">
                      <FileImage className="h-12 w-12 text-white/40" />
                    </div>
                  )}
                </div>

                {/* Download Buttons */}
                <div className="space-y-2">
                  {selectedOrder.image && (
                    <a
                      href={selectedOrder.image}
                      // prevent default navigation and fetch the image to force download
                      onClick={(e) => {
                        e.preventDefault()
                        const filename = (selectedOrder.image || '').split('/').pop() || `${selectedOrder.nombre.replace(/ /g, '')}.png`
                        downloadImage(selectedOrder.image as string, filename)
                      }}
                      rel="noreferrer"
                      className="w-full flex items-center justify-between bg-[#555555] rounded-lg px-4 py-3 hover:bg-[#666666] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileImage className="h-5 w-5 text-white" />
                        <span className="text-white text-sm font-[family-name:var(--font-montserrat)]">Descargar imagen</span>
                      </div>
                      <Download className="h-4 w-4 text-white" />
                    </a>
                  )}

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
                    <span className="text-white">{selectedOrder.email}</span>
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
                    Pendiente
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

      {/* Edit Modal */}
      {showEditModal && orderToEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#444444] rounded-2xl p-6 max-w-md w-full shadow-2xl border border-[#888888]/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Editar Pedido {orderToEdit.id}</h3>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setOrderToEdit(null)
                }}
                className="text-white hover:text-white/70"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-white text-sm font-semibold mb-1 block">Nombre</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    setEditErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                  className={`bg-[#555555] text-white placeholder:text-white/50 ${editErrors.name ? "border-red-400" : "border-[#888888]/30"}`}
                />
                {editErrors.name && <p className="text-sm text-red-400 mt-1">{editErrors.name}</p>}
              </div>
              <div>
                <label className="text-white text-sm font-semibold mb-1 block">Correo</label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                    setEditErrors((prev) => ({ ...prev, email: undefined }))
                  }}
                  className={`bg-[#555555] text-white placeholder:text-white/50 ${editErrors.email ? "border-red-400" : "border-[#888888]/30"}`}
                  style={{ textDecoration: 'none', color: 'white' }}
                />
                {editErrors.email && <p className="text-sm text-red-400 mt-1">{editErrors.email}</p>}
              </div>
              <div>
                <label className="text-white text-sm font-semibold mb-1 block">Teléfono</label>
                <Input
                  inputMode="tel"
                  pattern="[0-9]*"
                  maxLength={15}
                  value={editForm.phone_number}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, "")
                    setEditForm((prev) => ({ ...prev, phone_number: digitsOnly }))
                    setEditErrors((prev) => ({ ...prev, phone_number: undefined }))
                  }}
                  className={`bg-[#555555] text-white placeholder:text-white/50 ${editErrors.phone_number ? "border-red-400" : "border-[#888888]/30"}`}
                />
                {editErrors.phone_number && <p className="text-sm text-red-400 mt-1">{editErrors.phone_number}</p>}
              </div>
              <div>
                <label className="text-white text-sm font-semibold mb-1 block">Estado</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, status: "pendiente" }))}
                    className={`py-2 px-3 rounded-full text-white text-sm font-semibold transition-all ${
                      editForm.status === "pendiente" ? "bg-[#66C1C6] ring-2 ring-white" : "bg-[#555555] hover:bg-[#666666]"
                    }`}
                  >
                    Pendiente
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, status: "en_revision" }))}
                    className={`py-2 px-3 rounded-full text-white text-sm font-semibold transition-all ${
                      editForm.status === "en_revision" ? "bg-[#6A29B5] ring-2 ring-white" : "bg-[#555555] hover:bg-[#666666]"
                    }`}
                  >
                    En revisión
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, status: "aprobado" }))}
                    className={`py-2 px-3 rounded-full text-white text-sm font-semibold transition-all ${
                      editForm.status === "aprobado" ? "bg-[#E71D73] ring-2 ring-white" : "bg-[#555555] hover:bg-[#666666]"
                    }`}
                  >
                    Aprobado
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1 border-[#888888]/30 text-white hover:bg-[#555555] bg-transparent"
                onClick={() => {
                  setShowEditModal(false)
                  setOrderToEdit(null)
                }}
                disabled={isUpdating}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-[#4C2C84] text-white hover:bg-[#6A29B5]"
                onClick={confirmEdit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                {isUpdating ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
