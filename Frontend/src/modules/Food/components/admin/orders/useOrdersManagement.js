import { useState, useMemo } from "react"
import { exportToCSV, exportToExcel, exportToPDF, exportToJSON } from "./ordersExportUtils"
import { generateOrderInvoice } from "../../../utils/printOrderInvoice"

const debugError = () => { }


const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value) => `INR ${toNumber(value).toFixed(2)}`
const formatDisplayText = (value, fallback = "N/A") => {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  return normalized || fallback
}


export function useOrdersManagement(orders, statusKey, title) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isViewOrderOpen, setIsViewOrderOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [filters, setFilters] = useState({
    paymentStatus: "",
    deliveryType: "",
    deliveryMode: "",
    minAmount: "",
    maxAmount: "",
    dateFilterMode: "date", // "date" = filter by date range, "time" = filter by time-of-day window
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
    restaurant: "",
  })
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    orderId: true,
    orderDate: true,
    orderType: true,
    deliveryMode: true,
    orderOtp: true,
    customer: true,
    restaurant: true,
    foodItems: true,
    totalAmount: true,
    paymentType: true,
    paymentCollectionStatus: true,
    orderStatus: true,
    actions: true,
  })

  // Get unique restaurants from orders
  const restaurants = useMemo(() => {
    return [...new Set(orders.map(o => o.restaurant))]
  }, [orders])

  // Apply search and filters
  const filteredOrders = useMemo(() => {
    let result = [...orders]

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => {
        const safeTotal =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        const totalStr = String(safeTotal)
        return (
          String(order.orderId || "")
            .toLowerCase()
            .includes(query) ||
          String(order.customerName || "")
            .toLowerCase()
            .includes(query) ||
          String(order.restaurant || "")
            .toLowerCase()
            .includes(query) ||
          String(order.customerPhone || "").includes(query) ||
          totalStr.includes(query)
        )
      })
    }

    // Apply filters
    if (filters.paymentStatus) {
      const wanted = filters.paymentStatus.toLowerCase()
      result = result.filter((order) => {
        const paymentStatus = String(order.paymentStatus || "").toLowerCase()
        const collectionStatus = String(order.paymentCollectionStatus || "").toLowerCase()
        return paymentStatus === wanted || collectionStatus === wanted
      })
    }

    if (filters.deliveryType) {
      result = result.filter(
        (order) => String(order.deliveryType || "").toLowerCase() === filters.deliveryType.toLowerCase(),
      )
    }

    if (filters.deliveryMode === "quick" || filters.deliveryMode === "basic") {
      result = result.filter(
        (order) => String(order.deliveryMode || "basic").toLowerCase() === filters.deliveryMode,
      )
    } else if (filters.deliveryMode === "sla_breached") {
      result = result.filter(
        (order) =>
          String(order.deliveryMode || "").toLowerCase() === "quick" &&
          order?.sla?.breached === true,
      )
    }

    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount)
      result = result.filter(order => {
        const amount =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        return Number(amount) >= min
      })
    }

    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount)
      result = result.filter(order => {
        const amount =
          order.totalAmount ??
          order.total ??
          order.pricing?.total ??
          0
        return Number(amount) <= max
      })
    }

    if (filters.restaurant) {
      result = result.filter(order => order.restaurant === filters.restaurant)
    }

    // Exactly one mode applies at a time — "date" filters by calendar day, "time" by daily clock window.
    const dateFilterMode = filters.dateFilterMode || "date"

    if (dateFilterMode === "date" && (filters.fromDate || filters.toDate)) {
      const fromDay = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`).getTime() : null
      const toDay = filters.toDate ? new Date(`${filters.toDate}T23:59:59.999`).getTime() : null

      result = result.filter((order) => {
        const created = order.createdAt ? new Date(order.createdAt) : null
        if (!created || Number.isNaN(created.getTime())) return false
        const ms = created.getTime()
        if (fromDay !== null && ms < fromDay) return false
        if (toDay !== null && ms > toDay) return false
        return true
      })
    } else if (dateFilterMode === "time" && (filters.fromTime || filters.toTime)) {
      const toMinutes = (hhmm) => {
        const [h, m] = String(hhmm).split(":").map(Number)
        return h * 60 + m
      }
      const fromMin = filters.fromTime ? toMinutes(filters.fromTime) : 0
      const toMin = filters.toTime ? toMinutes(filters.toTime) : 24 * 60 - 1

      result = result.filter((order) => {
        const created = order.createdAt ? new Date(order.createdAt) : null
        if (!created || Number.isNaN(created.getTime())) return false
        const minutes = created.getHours() * 60 + created.getMinutes()
        // A window like 22:00-02:00 wraps past midnight.
        return fromMin <= toMin
          ? minutes >= fromMin && minutes <= toMin
          : minutes >= fromMin || minutes <= toMin
      })
    }

    return result
  }, [orders, searchQuery, filters])

  const count = filteredOrders.length

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    // dateFilterMode is just a selector, not itself a filter — don't count it.
    return Object.entries(filters).filter(([key, value]) => key !== "dateFilterMode" && value !== "").length
  }, [filters])

  const handleApplyFilters = () => {
    setIsFilterOpen(false)
  }

  const handleResetFilters = () => {
    setFilters({
      paymentStatus: "",
      deliveryType: "",
      deliveryMode: "",
      minAmount: "",
      maxAmount: "",
      dateFilterMode: "date",
      fromDate: "",
      toDate: "",
      fromTime: "",
      toTime: "",
      restaurant: "",
    })
  }

  const handleExport = (format) => {
    const filename = title.toLowerCase().replace(/\s+/g, "_")
    switch (format) {
      case "csv":
        exportToCSV(filteredOrders, filename)
        break
      case "excel":
        exportToExcel(filteredOrders, filename)
        break
      case "pdf":
        exportToPDF(filteredOrders, filename)
        break
      case "json":
        exportToJSON(filteredOrders, filename)
        break
      default:
        break
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setIsViewOrderOpen(true)
  }

  const handlePrintOrder = async (order) => {
    await generateOrderInvoice(order)
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      orderId: true,
      orderDate: true,
      orderType: true,
      orderOtp: true,
      customer: true,
      restaurant: true,
      foodItems: true,
      totalAmount: true,
      paymentType: true,
      paymentCollectionStatus: true,
      orderStatus: true,
      actions: true,
    })
  }

  return {
    searchQuery,
    setSearchQuery,
    isFilterOpen,
    setIsFilterOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isViewOrderOpen,
    setIsViewOrderOpen,
    selectedOrder,
    filters,
    setFilters,
    visibleColumns,
    filteredOrders,
    count,
    activeFiltersCount,
    restaurants,
    handleApplyFilters,
    handleResetFilters,
    handleExport,
    handleViewOrder,
    handlePrintOrder,
    toggleColumn,
    resetColumns,
  }
}

