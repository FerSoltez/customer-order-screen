"use client"

import { useState } from "react"
import { Search, FileImage, FileText, Eye, CheckCircle, Clock, Trash2, X, Bell, Download, Pencil } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Order {
  id: string
  nombre: string
  telefono: string
  email: string
  date: string
  status: "pendiente" | "en_revision" | "aprobado"
  image?: string
}

const mockOrders: Order[] = [
  {
    id: "#ORD-772",
    nombre: "Arath Balam",
    telefono: "9991234567",
    email: "dark.lion@gmail.com",
    date: "12 Enero, 2026",
    status: "en_revision",
    image: "/sports-jersey-red-black.jpg",
  },
  {
    id: "#ORD-771",
    nombre: "Fernando Solano",
    telefono: "9991234567",
    email: "dark.lion@gmail.com",
    date: "10 Enero, 2026",
    status: "pendiente",
    image: "/blue-sports-shirt.jpg",
  },
  {
    id: "#ORD-770",
    nombre: "Fernando Solano",
    telefono: "9991234567",
    email: "dark.lion@gmail.com",
    date: "20 Dic, 2026",
    status: "aprobado",
    image: "/green-sports-jersey.jpg",
  },
  {
    id: "#ORD-769",
    nombre: "Carlos López",
    telefono: "9997654321",
    email: "carlos.lopez@gmail.com",
    date: "18 Dic, 2026",
    status: "aprobado",
    image: "/white-sports-uniform.jpg",
  },
  {
    id: "#ORD-768",
    nombre: "Ana Martínez",
    telefono: "9998765432",
    email: "ana.martinez@gmail.com",
    date: "15 Dic, 2026",
    status: "pendiente",
    image: "/yellow-team-shirt.jpg",
  },
]

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(mockOrders[0])
  const [orders, setOrders] = useState<Order[]>(mockOrders)
  const [statusFilter, setStatusFilter] = useState<Order["status"] | "all">("all")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null)

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email.toLowerCase().includes(searchTerm.toLowerCase())
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

  const changeStatus = (orderId: string, clientName: string, newStatus: Order["status"]) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId && order.nombre === clientName ? { ...order, status: newStatus } : order
      )
    )
    if (selectedOrder?.id === orderId && selectedOrder?.nombre === clientName) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null))
    }
  }

  const handleDeleteClick = (order: Order) => {
    setOrderToDelete(order)
    setShowDeleteModal(true)
  }

  const confirmDelete = () => {
    if (orderToDelete) {
      setOrders((prev) => prev.filter((o) => !(o.id === orderToDelete.id && o.nombre === orderToDelete.nombre)))
      if (selectedOrder?.id === orderToDelete.id && selectedOrder?.nombre === orderToDelete.nombre) {
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
                      key={order.id + order.nombre}
                      className={`border-b border-white cursor-pointer transition-colors hover:bg-[#555555] ${selectedOrder?.id === order.id && selectedOrder?.nombre === order.nombre ? "bg-[#555555]" : ""}`}
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
                  key={order.id + order.nombre}
                  className={`bg-[#555555] rounded-xl p-4 cursor-pointer transition-all ${selectedOrder?.id === order.id && selectedOrder?.nombre === order.nombre ? "ring-2 ring-[#66C1C6]" : ""}`}
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
          </div>

          {/* Details Panel */}
          <div className="bg-[#444444] rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>DETALLES</h3>
              {selectedOrder && <span className="text-white font-semibold" style={{ fontFamily: 'Arboria-Black, sans-serif' }}>{selectedOrder.id}</span>}
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
                  <button className="w-full flex items-center justify-between bg-[#555555] rounded-lg px-4 py-3 hover:bg-[#666666] transition-colors">
                    <div className="flex items-center gap-3">
                      <FileImage className="h-5 w-5 text-white" />
                      <span className="text-white text-sm font-[family-name:var(--font-montserrat)]">{selectedOrder.nombre.replace(" ", "")}.img</span>
                    </div>
                    <Download className="h-4 w-4 text-white" />
                  </button>
                  <button className="w-full flex items-center justify-between bg-[#555555] rounded-lg px-4 py-3 hover:bg-[#666666] transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-white" />
                      <span className="text-white text-sm font-[family-name:var(--font-montserrat)]">{selectedOrder.nombre.replace(" ", "")}.xlsx</span>
                    </div>
                    <Download className="h-4 w-4 text-white" />
                  </button>
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
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.nombre, "pendiente")}
                    disabled={selectedOrder.status === "pendiente"}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Pendientes
                  </Button>
                  <Button
                    className="w-full bg-[#743EB3] text-white hover:bg-[#6A29B5] rounded-full font-semibold font-[family-name:var(--font-montserrat)]"
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.nombre, "en_revision")}
                    disabled={selectedOrder.status === "en_revision"}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {"En revision"}
                  </Button>
                  <Button
                    className="w-full bg-[#E71D73] text-white hover:bg-[#d01a68] rounded-full font-semibold font-[family-name:var(--font-montserrat)]"
                    onClick={() => changeStatus(selectedOrder.id, selectedOrder.nombre, "aprobado")}
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
