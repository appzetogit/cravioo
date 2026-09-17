import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { CalendarCheck, Loader2, MapPin, Search, Star, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { useLocation as useUserLocation } from "@food/hooks/useLocation"
import { isModuleAuthenticated } from "@food/utils/auth"
import { diningErrorMessage, formatCurrency } from "@food/utils/dining"

const SORTS = [
  { value: "popular", label: "Popular" },
  { value: "rating", label: "Top rated" },
  { value: "nearest", label: "Nearest" },
  { value: "cost_low", label: "Cost: low to high" },
  { value: "cost_high", label: "Cost: high to low" },
]

function DiningCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-[#1a1a1a]">
      <div className="aspect-[16/9] bg-gray-200 dark:bg-gray-800" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  )
}

export default function Dining() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { location: userLocation } = useUserLocation()

  const [banners, setBanners] = useState([])
  const [bannerIndex, setBannerIndex] = useState(0)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState(searchParams.get("q") || "")
  const [sort, setSort] = useState("popular")
  const categoryId = searchParams.get("category") || ""
  const isAuthenticated = isModuleAuthenticated("user")
  const requestIdRef = useRef(0)

  const coords = useMemo(() => {
    const lat = userLocation?.latitude
    const lng = userLocation?.longitude
    return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null
  }, [userLocation?.latitude, userLocation?.longitude])

  useEffect(() => {
    // Banners + categories are cached server-side, so one fetch on mount is enough.
    Promise.all([diningAPI.public.listBanners(), diningAPI.public.listCategories()])
      .then(([bannerRes, categoryRes]) => {
        setBanners(bannerRes?.data?.data?.items || [])
        setCategories(categoryRes?.data?.data?.items || [])
      })
      .catch(() => {
        setBanners([])
        setCategories([])
      })
  }, [])

  // Auto-rotate only when admin has more than one active banner.
  useEffect(() => {
    if (banners.length <= 1) return undefined
    const timer = setInterval(() => {
      setBannerIndex((prev) => (prev + 1) % banners.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [banners.length])

  const fetchRestaurants = useCallback(
    async (page = 1) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      if (page === 1) setLoading(true)
      else setLoadingMore(true)

      try {
        const res = await diningAPI.public.listRestaurants({
          page,
          limit: 12,
          sort,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(coords && sort === "nearest" ? coords : {}),
        })
        // Ignore responses from filters the user has already moved past.
        if (requestIdRef.current !== requestId) return

        const data = res?.data?.data || { items: [], pagination: { page: 1, totalPages: 1 } }
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]))
        setPagination(data.pagination)
      } catch (error) {
        toast.error(diningErrorMessage(error, "Failed to load dining places"))
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [sort, search, categoryId, coords],
  )

  useEffect(() => {
    const timer = setTimeout(() => fetchRestaurants(1), search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [fetchRestaurants, search])

  /** Banner links can be an in-app path or an external URL. */
  const openBannerLink = (link) => {
    const target = String(link || "").trim()
    if (!target) return
    if (/^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener,noreferrer")
      return
    }
    navigate(target)
  }

  const setCategory = (id) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set("category", id)
    else next.delete("category")
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 dark:bg-[#0f0f0f]">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Dining Out</h1>
          <button
            type="button"
            onClick={() =>
              navigate(isAuthenticated ? "/food/user/dining/bookings" : "/user/auth/login", {
                state: isAuthenticated ? undefined : { redirectTo: "/food/user/dining/bookings" },
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            <CalendarCheck className="h-4 w-4" /> My bookings
          </button>
        </div>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search restaurants, cuisines or city"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400 dark:border-gray-700 dark:bg-[#111] dark:text-white"
          />
        </div>
      </div>

      <div className="space-y-5 p-4">
        {banners.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${bannerIndex * 100}%)` }}
            >
              {banners.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openBannerLink(item.link)}
                  disabled={!item.link}
                  className="relative w-full shrink-0 text-left disabled:cursor-default"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="aspect-[12/5] w-full object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                  <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                    <span className="block text-lg font-semibold">{item.title}</span>
                    {item.subtitle && <span className="block text-sm text-white/90">{item.subtitle}</span>}
                    {item.ctaText && (
                      <span className="mt-2 inline-flex w-fit rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-900">
                        {item.ctaText}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {banners.length > 1 && (
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {banners.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Go to banner ${index + 1}`}
                    onClick={() => setBannerIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === bannerIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {categories.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Browse by mood</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`flex shrink-0 flex-col items-center gap-1.5 ${
                  !categoryId ? "opacity-100" : "opacity-70"
                }`}
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 bg-white dark:bg-[#1a1a1a] ${
                    !categoryId ? "border-orange-400" : "border-transparent"
                  }`}
                >
                  <UtensilsCrossed className="h-6 w-6 text-orange-500" />
                </span>
                <span className="w-16 truncate text-center text-xs text-gray-700 dark:text-gray-300">
                  All
                </span>
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategory(category.id === categoryId ? "" : category.id)}
                  className="flex shrink-0 flex-col items-center gap-1.5"
                >
                  <img
                    src={category.image}
                    alt={category.name}
                    loading="lazy"
                    className={`h-16 w-16 rounded-2xl border-2 object-cover ${
                      categoryId === category.id ? "border-orange-400" : "border-transparent"
                    }`}
                  />
                  <span className="w-16 truncate text-center text-xs text-gray-700 dark:text-gray-300">
                    {category.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SORTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              disabled={option.value === "nearest" && !coords}
              className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-40 ${
                sort === option.value
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-300"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <DiningCardSkeleton key={index} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
            <UtensilsCrossed className="mx-auto h-9 w-9 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No dining places found</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((place) => (
                <Link
                  key={place.id}
                  to={`/food/user/dining/${place.restaurantId}`}
                  className="overflow-hidden rounded-2xl border border-gray-100 bg-white transition hover:shadow-md dark:border-gray-800 dark:bg-[#1a1a1a]"
                >
                  <div className="relative aspect-[16/9]">
                    <img
                      src={place.coverImage}
                      alt={place.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    {!place.isOnline && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
                        Bookings paused
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-semibold text-gray-900 dark:text-white">{place.name}</h3>
                      {place.ratingCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                          {place.ratingAvg} <Star className="h-3 w-3 fill-white" />
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                      {(place.cuisines || []).slice(0, 3).join(", ") || "Dining"}
                    </p>
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                      <span>{formatCurrency(place.costForTwo)} for two</span>
                      {place.distanceInKm != null && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {place.distanceInKm} km
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {pagination.page < pagination.totalPages && (
              <button
                type="button"
                onClick={() => fetchRestaurants(pagination.page + 1)}
                disabled={loadingMore}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-200"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
