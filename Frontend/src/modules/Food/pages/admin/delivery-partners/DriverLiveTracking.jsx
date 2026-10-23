import { useEffect, useMemo, useRef, useState } from "react"
import { Bike, Loader2, MapPin } from "lucide-react"
import { adminAPI } from "@food/api"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { loadGoogleMaps as loadGoogleMapsSdk } from "@core/services/googleMapsLoader"
import { subscribeAllDeliveryLocations, subscribeOrderTracking } from "@food/realtimeTracking"
import { decodePolyline } from "@food/utils/liveTrackingPolyline"
import bikeLogo from "@food/assets/bikelogo.png"

const ZONE_COLOR = "#3b82f6"
const ORDERS_REFRESH_MS = 30000

const toPath = (zone) =>
  (zone?.coordinates || [])
    .map((c) => ({
      lat: Number(c?.latitude ?? c?.lat),
      lng: Number(c?.longitude ?? c?.lng),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

// Ray-casting point in polygon (same approach as backend geo.js)
const inPolygon = (lat, lng, path) => {
  if (path.length < 3) return false
  let inside = false
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lng
    const yi = path[i].lat
    const xj = path[j].lng
    const yj = path[j].lat
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function useGoogleMap(containerRef) {
  const [map, setMap] = useState(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const key = await getGoogleMapsApiKey()
        if (!key) {
          setError("Google Maps API key not found")
          return
        }
        await loadGoogleMapsSdk(key)
        if (cancelled || !containerRef.current) return
        setMap(
          new window.google.maps.Map(containerRef.current, {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 5,
            streetViewControl: false,
            gestureHandling: "greedy",
          }),
        )
      } catch (e) {
        setError("Failed to load map")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [containerRef])
  return { map, error }
}

const bikeIcon = () => ({
  url: bikeLogo,
  scaledSize: new window.google.maps.Size(40, 40),
  anchor: new window.google.maps.Point(20, 20),
})

export default function DriverLiveTracking() {
  const driversMapEl = useRef(null)
  const ordersMapEl = useRef(null)
  const { map: driversMap, error: driversMapError } = useGoogleMap(driversMapEl)
  const { map: ordersMap, error: ordersMapError } = useGoogleMap(ordersMapEl)

  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState("")
  const [directory, setDirectory] = useState({}) // driverId -> {name, phone}
  const [liveDrivers, setLiveDrivers] = useState([]) // firebase online drivers
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [selectedOrderId, setSelectedOrderId] = useState("")
  const [liveByOrder, setLiveByOrder] = useState({}) // orderId -> firebase active_orders node

  const zonePath = useMemo(() => {
    const z = zones.find((x) => String(x._id || x.id) === zoneId)
    return z ? toPath(z) : null
  }, [zones, zoneId])

  // Zones + driver names
  useEffect(() => {
    adminAPI
      .getZones({ limit: 1000 })
      .then((res) => setZones(res?.data?.data?.zones || []))
      .catch(() => setZones([]))
    adminAPI
      .getDeliveryPartners({ limit: 1000, status: "approved", isActive: true, includeAvailability: false })
      .then((res) => {
        const next = {}
        ;(res?.data?.data?.deliveryPartners || []).forEach((d) => {
          const id = d?._id || d?.id || d?.deliveryId
          if (id) next[String(id)] = { name: d?.name || "Delivery Partner", phone: d?.phone || "" }
        })
        setDirectory(next)
      })
      .catch(() => {})
  }, [])

  // Map 1 data: all online drivers from Firebase (same source as the existing delivery-boy map)
  useEffect(() => {
    const unsub = subscribeAllDeliveryLocations((node) => {
      const next = Object.entries(node || {})
        .map(([id, payload]) => {
          const loc = payload?.location || {}
          const lat = Number(loc.lat)
          const lng = Number(loc.lng)
          const online = loc.isOnline === true || loc.status === "online" || loc.status === "busy"
          if (!online || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
          return { id: String(id), lat, lng, busy: Boolean(loc.activeOrderId) || loc.status === "busy" }
        })
        .filter(Boolean)
      setLiveDrivers(next)
    })
    return () => typeof unsub === "function" && unsub()
  }, [])

  // Map 2 data: accepted orders of selected zone
  useEffect(() => {
    let cancelled = false
    const load = async (first) => {
      if (first) setOrdersLoading(true)
      try {
        const res = await adminAPI.getLiveTrackingOrders(zoneId ? { zoneId } : {})
        if (!cancelled) setOrders(res?.data?.data?.orders || [])
      } catch {
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled && first) setOrdersLoading(false)
      }
    }
    load(true)
    const t = setInterval(() => load(false), ORDERS_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [zoneId])

  useEffect(() => {
    if (selectedOrderId && !orders.some((o) => o.id === selectedOrderId)) setSelectedOrderId("")
  }, [orders, selectedOrderId])

  // Firebase live node for each tracked order (driver position + route polyline written by the driver app)
  const orderIdsKey = orders.map((o) => o.id).join(",")
  useEffect(() => {
    const unsubs = orders.map((o) =>
      subscribeOrderTracking(o.id, (data) => setLiveByOrder((prev) => ({ ...prev, [o.id]: data }))),
    )
    return () => unsubs.forEach((u) => typeof u === "function" && u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdsKey])

  const visibleDrivers = useMemo(
    () => (zonePath ? liveDrivers.filter((d) => inPolygon(d.lat, d.lng, zonePath)) : liveDrivers),
    [liveDrivers, zonePath],
  )

  // ---- Map 1 rendering: zone polygons + drivers
  const zoneShapesRef = useRef([])
  useEffect(() => {
    if (!driversMap) return
    zoneShapesRef.current.forEach((s) => s.setMap(null))
    zoneShapesRef.current = []
    const bounds = new window.google.maps.LatLngBounds()
    const shown = zoneId ? zones.filter((z) => String(z._id || z.id) === zoneId) : zones
    shown.forEach((z) => {
      const path = toPath(z)
      if (path.length < 3) return
      path.forEach((p) => bounds.extend(p))
      const poly = new window.google.maps.Polygon({
        paths: path,
        strokeColor: ZONE_COLOR,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: ZONE_COLOR,
        fillOpacity: 0.12,
        clickable: false,
        map: driversMap,
      })
      zoneShapesRef.current.push(poly)
    })
    if (!bounds.isEmpty()) driversMap.fitBounds(bounds)
  }, [driversMap, zones, zoneId])

  const driverMarkersRef = useRef(new Map())
  useEffect(() => {
    if (!driversMap) return
    const markers = driverMarkersRef.current
    const seen = new Set()
    visibleDrivers.forEach((d) => {
      seen.add(d.id)
      const title = `${directory[d.id]?.name || "Driver"}${d.busy ? " (on order)" : ""}`
      let m = markers.get(d.id)
      if (!m) {
        m = new window.google.maps.Marker({ map: driversMap, position: d, icon: bikeIcon(), title })
        markers.set(d.id, m)
      } else {
        m.setPosition(d)
        m.setTitle(title)
      }
    })
    markers.forEach((m, id) => {
      if (!seen.has(id)) {
        m.setMap(null)
        markers.delete(id)
      }
    })
  }, [driversMap, visibleDrivers, directory])

  // ---- Map 2 rendering: restaurant, customer, driver, route per order
  const orderOverlaysRef = useRef([])
  const driverOrderMarkersRef = useRef(new Map())
  const routeLinesRef = useRef(new Map())

  // static markers (restaurant + customer) — rebuilt only when the order list changes
  useEffect(() => {
    if (!ordersMap) return
    orderOverlaysRef.current.forEach((o) => o.setMap(null))
    orderOverlaysRef.current = []
    const bounds = new window.google.maps.LatLngBounds()
    orders.forEach((o) => {
      if (o.restaurant) {
        orderOverlaysRef.current.push(
          new window.google.maps.Marker({
            map: ordersMap,
            position: o.restaurant,
            title: `Restaurant: ${o.restaurant.name}`,
            label: { text: "R", color: "#fff", fontWeight: "700" },
          }),
        )
        bounds.extend(o.restaurant)
      }
      if (o.customer) {
        orderOverlaysRef.current.push(
          new window.google.maps.Marker({
            map: ordersMap,
            position: o.customer,
            title: `Customer: ${o.customer.name}`,
            label: { text: "C", color: "#fff", fontWeight: "700" },
          }),
        )
        bounds.extend(o.customer)
      }
    })
    if (!bounds.isEmpty()) ordersMap.fitBounds(bounds)
  }, [ordersMap, orders])

  // live driver markers + route lines
  useEffect(() => {
    if (!ordersMap) return
    const seen = new Set()
    orders.forEach((o) => {
      const live = liveByOrder[o.id]
      const lat = Number(live?.boy_lat ?? live?.lat)
      const lng = Number(live?.boy_lng ?? live?.lng)
      const pos =
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : o.driver?.location || null
      if (!pos) return
      seen.add(o.id)
      const title = `${o.driver?.name || "Driver"} · #${o.orderId}`
      let m = driverOrderMarkersRef.current.get(o.id)
      if (!m) {
        m = new window.google.maps.Marker({ map: ordersMap, position: pos, icon: bikeIcon(), title, zIndex: 1000 })
        m.addListener("click", () => setSelectedOrderId(o.id))
        driverOrderMarkersRef.current.set(o.id, m)
      } else {
        m.setPosition(pos)
        m.setTitle(title)
      }
      // Route polyline the driver app already stored in Firebase (no Directions API call)
      const encoded = typeof live?.polyline === "string" ? live.polyline : live?.polyline?.points
      const path = encoded ? decodePolyline(encoded) : []
      let line = routeLinesRef.current.get(o.id)
      if (path.length > 1) {
        if (!line) {
          line = new window.google.maps.Polyline({ map: ordersMap, strokeWeight: 4, strokeOpacity: 0.8 })
          routeLinesRef.current.set(o.id, line)
        }
        line.setPath(path)
        line.setOptions({ strokeColor: o.id === selectedOrderId ? "#ef4444" : "#6366f1" })
      } else if (line) {
        line.setMap(null)
        routeLinesRef.current.delete(o.id)
      }
    })
    driverOrderMarkersRef.current.forEach((m, id) => {
      if (!seen.has(id)) {
        m.setMap(null)
        driverOrderMarkersRef.current.delete(id)
      }
    })
    routeLinesRef.current.forEach((l, id) => {
      if (!seen.has(id)) {
        l.setMap(null)
        routeLinesRef.current.delete(id)
      }
    })
  }, [ordersMap, orders, liveByOrder, selectedOrderId])

  const focusOrder = (o) => {
    setSelectedOrderId(o.id)
    const live = liveByOrder[o.id]
    const lat = Number(live?.boy_lat ?? live?.lat)
    const lng = Number(live?.boy_lng ?? live?.lng)
    const pos = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : o.driver?.location || o.restaurant
    if (pos && ordersMap) {
      ordersMap.panTo(pos)
      ordersMap.setZoom(15)
    }
  }

  const MapBox = ({ innerRef, loading, error }) => (
    <div className="relative h-[460px] rounded-lg overflow-hidden border border-slate-200">
      <div ref={innerRef} className="w-full h-full" />
      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-sm text-slate-600">
          {error ? (
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {error}
            </span>
          ) : (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-slate-50 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Live Tracking</h1>
            <p className="text-sm text-slate-600">Driver locations and active order tracking by zone</p>
          </div>
        </div>
        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z._id || z.id} value={String(z._id || z.id)}>
              {z.name || z.zoneName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900 mb-1">Driver Locations</h2>
          <p className="text-xs text-slate-500 mb-3">
            Online drivers: <strong>{visibleDrivers.length}</strong>
            {zoneId ? " in selected zone" : ""}
          </p>
          <MapBox innerRef={driversMapEl} loading={!driversMap} error={driversMapError} />
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900 mb-1">Order Tracking</h2>
          <p className="text-xs text-slate-500 mb-3">
            Active orders: <strong>{orders.length}</strong> · R = restaurant, C = customer
          </p>
          <MapBox innerRef={ordersMapEl} loading={!ordersMap} error={ordersMapError} />
          <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {ordersLoading && <p className="p-3 text-sm text-slate-500">Loading orders...</p>}
            {!ordersLoading && orders.length === 0 && (
              <p className="p-3 text-sm text-slate-500">No active orders being delivered.</p>
            )}
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => focusOrder(o)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                  o.id === selectedOrderId ? "bg-indigo-50" : ""
                }`}
              >
                <div className="font-medium text-slate-900">
                  #{o.orderId} · {o.restaurant?.name || "Restaurant"}
                </div>
                <div className="text-xs text-slate-500">
                  Driver: {o.driver?.name || "-"} {o.driver?.phone ? `(${o.driver.phone})` : ""} · Customer:{" "}
                  {o.customer?.name || "-"}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
