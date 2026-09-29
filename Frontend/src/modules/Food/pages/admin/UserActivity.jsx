import { useState, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { PAGE_SIZE as PAGINATION_PAGE_SIZE } from "@/shared/constants/pagination"

const PAGE_SIZE = PAGINATION_PAGE_SIZE.FIFTY

const STATUS_TILES = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "no_order_30d", label: "No Order 30D+" },
  { key: "no_order_60d", label: "No Order 60D+" },
  { key: "no_order_90d", label: "No Order 90D+" },
  { key: "inactive", label: "Inactive" },
  { key: "deleted", label: "Deleted" },
]

const STATUS_BADGE = {
  active: "bg-[#EAF9EE] text-[#1E9E4A]",
  no_order_30d: "bg-amber-100 text-amber-700",
  no_order_60d: "bg-orange-100 text-orange-700",
  no_order_90d: "bg-red-100 text-red-700",
  inactive: "bg-slate-200 text-slate-600",
  deleted: "bg-gray-800 text-white",
}

const STATUS_LABEL = {
  active: "Active",
  no_order_30d: "No Order 30D+",
  no_order_60d: "No Order 60D+",
  no_order_90d: "No Order 90D+",
  inactive: "Inactive",
  deleted: "Deleted",
}

const SORT_OPTIONS = [
  { value: "lastActive-desc", label: "Last Active (Newest)" },
  { value: "lastActive-asc", label: "Last Active (Oldest)" },
  { value: "lastOrder-desc", label: "Last Order (Newest)" },
  { value: "lastOrder-asc", label: "Last Order (Oldest)" },
  { value: "totalOrders-desc", label: "Total Orders (High to Low)" },
  { value: "joined-desc", label: "Joined (Newest)" },
]

const formatDate = (value) => {
  if (!value) return "-"
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return "-"
  }
}

export default function UserActivity() {
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [status, setStatus] = useState("")
  const [sortBy, setSortBy] = useState("lastActive-desc")
  const [page, setPage] = useState(1)
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState({})
  const [loading, setLoading] = useState(true)

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE))

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        page,
        limit: PAGE_SIZE,
        sortBy,
        ...(searchQuery && { search: searchQuery }),
        ...(status && { status }),
      }
      const response = await adminAPI.getUserActivity(params)
      const data = response?.data?.data
      setUsers(data?.customers || [])
      setTotal(data?.total || 0)
      setStatusCounts(data?.statusCounts || {})
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load user activity")
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [page, sortBy, searchQuery, status])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setSearchQuery(searchInput.trim())
  }

  const handleStatusTile = (key) => {
    setStatus(key)
    setPage(1)
  }

  return (
    <div className="p-4 lg:p-6 bg-[#FBF9F6] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl border border-[#EDE8E0] p-6 mb-6">
          <h1 className="text-xl font-bold text-[#2B2620]">User Activity &amp; Churn</h1>
          <p className="text-sm text-[#8A8074] mt-1">
            Tracks engagement and ordering behavior per customer. Status is computed live from last activity and order history.
          </p>
        </div>

        {/* Status tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {STATUS_TILES.map((tile) => (
            <button
              key={tile.key || "all"}
              onClick={() => handleStatusTile(tile.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                status === tile.key
                  ? "border-[#32C45A] bg-[#EAF9EE]"
                  : "border-[#EDE8E0] bg-white hover:bg-[#FAFAFA]"
              }`}
            >
              <p className="text-[11px] font-medium text-[#8A8074]">{tile.label}</p>
              <p className="text-lg font-bold text-[#2B2620]">
                {tile.key ? (statusCounts[tile.key] ?? 0) : Object.values(statusCounts).reduce((a, b) => a + (b || 0), 0)}
              </p>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[#EDE8E0] p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A8074]" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, email or phone..."
                className="w-full pl-9 pr-3 py-2 border border-[#EDE8E0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#32C45A]"
              />
            </div>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-[#32C45A] text-white hover:bg-[#28A448]">
              Search
            </button>
          </form>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-[#EDE8E0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#32C45A]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-[#EDE8E0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead className="bg-[#FAFAFA] border-b border-[#EDE8E0]">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Last Active</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">First Order</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Last Order</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Total Orders</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[#8A8074] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE8E0]">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-[#8A8074]">Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-[#8A8074]">No customers found.</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u._id} className="hover:bg-[#FAFAFA]">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-[#2B2620]">{u.name}</span>
                          <span className="text-xs text-[#8A8074]">{u.phone || u.email || "-"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#5C5247]">{formatDate(u.joiningDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#5C5247]">{formatDate(u.lastActiveDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#5C5247]">{formatDate(u.firstOrderDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#5C5247]">{formatDate(u.lastOrderDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#5C5247]">{u.totalOrders}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[u.status] || "bg-slate-100 text-slate-600"}`}>
                          {STATUS_LABEL[u.status] || u.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 flex items-center justify-between gap-3 border-t border-[#EDE8E0]">
            <p className="text-sm text-[#5C5247]">
              Page {page} of {totalPages} ({total} customers)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EDE8E0] bg-white text-[#5C5247] hover:bg-[#EAF9EE] hover:text-[#32C45A] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#EDE8E0] bg-white text-[#5C5247] hover:bg-[#EAF9EE] hover:text-[#32C45A] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
