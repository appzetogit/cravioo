import { useCallback, useEffect, useRef, useState } from "react"
import { ImageIcon, Loader2, Lock, Pencil, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { diningErrorMessage, validateImageFile } from "@food/utils/dining"

const PLACEMENT_LABELS = {
  home_top: "Dining home — top banner",
  listing: "Dining listing — strip banner",
  detail: "Outlet detail — booking banner",
}

const PLACEMENT_HINTS = {
  home_top: "Shown at the top of the user dining tab (recommended 1200×500).",
  listing: "Shown between outlet cards on the listing page (recommended 1200×300).",
  detail: "Shown above the booking form on an outlet page (recommended 1200×300).",
}

export default function DiningBanners() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: "", subtitle: "", ctaText: "", link: "", isActive: true })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)
  const previewUrlRef = useRef("")

  const loadBanners = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.admin.listBanners()
      setBanners(res?.data?.data?.items || [])
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining banners"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBanners()
  }, [loadBanners])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const setPreview = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url && url.startsWith("blob:") ? url : ""
    setImagePreview(url)
  }

  const openEdit = (banner) => {
    setEditing(banner)
    setForm({
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      ctaText: banner.ctaText || "",
      link: banner.link || "",
      isActive: banner.isActive !== false,
    })
    setImageFile(null)
    setPreview(banner.image || "")
    setErrors({})
  }

  const closeModal = () => {
    if (saving) return
    setEditing(null)
    setPreview("")
    setImageFile(null)
  }

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const imageError = validateImageFile(file)
    if (imageError) {
      setErrors((prev) => ({ ...prev, image: imageError }))
      return
    }
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
    setErrors((prev) => ({ ...prev, image: "" }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const next = {}
    if (form.title.trim().length < 2) next.title = "Banner title is required"
    if (form.link && !/^(https?:\/\/|\/)/.test(form.link.trim())) {
      next.link = "Link must start with http(s):// or /"
    }
    if (!imagePreview) next.image = "Banner image is required"
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const formData = new FormData()
    formData.append("title", form.title.trim())
    formData.append("subtitle", form.subtitle.trim())
    formData.append("ctaText", form.ctaText.trim())
    formData.append("link", form.link.trim())
    formData.append("isActive", String(form.isActive))
    if (imageFile) formData.append("image", imageFile)

    setSaving(true)
    try {
      await diningAPI.admin.updateBanner(editing.id, formData)
      toast.success("Dining banner updated")
      setEditing(null)
      setPreview("")
      setImageFile(null)
      await loadBanners()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to update dining banner"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Dining Banners</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          These banner slots are fixed — update the artwork and copy, they cannot be added or removed.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading banners…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <div key={banner.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative aspect-[12/5] bg-slate-100">
                {banner.image ? (
                  <img src={banner.image} alt={banner.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <span
                  className={`absolute right-2 top-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    banner.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-300"
                  }`}
                >
                  {banner.isActive ? "Live" : "Hidden"}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
                  {PLACEMENT_LABELS[banner.placement] || banner.placement}
                </p>
                <h3 className="font-semibold text-slate-900">{banner.title}</h3>
                <p className="line-clamp-2 text-sm text-slate-500">{banner.subtitle || "-"}</p>
                <button
                  type="button"
                  onClick={() => openEdit(banner)}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-4 w-4" /> Edit banner
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Edit dining banner</h2>
                <p className="text-xs text-slate-500">{PLACEMENT_HINTS[editing.placement]}</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Banner image <span className="text-rose-500">*</span>
                </label>
                <div className="aspect-[12/5] w-full overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <Upload className="h-7 w-7" />
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change image
                </button>
                {errors.image && <p className="mt-1 text-xs text-rose-600">{errors.image}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subtitle</label>
                <input
                  value={form.subtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">CTA text</label>
                  <input
                    value={form.ctaText}
                    onChange={(event) => setForm((prev) => ({ ...prev, ctaText: event.target.value }))}
                    placeholder="Book now"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Link</label>
                  <input
                    value={form.link}
                    onChange={(event) => setForm((prev) => ({ ...prev, link: event.target.value }))}
                    placeholder="/food/user/dining"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                  {errors.link && <p className="mt-1 text-xs text-rose-600">{errors.link}</p>}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                />
                Show this banner in the user app
              </label>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
