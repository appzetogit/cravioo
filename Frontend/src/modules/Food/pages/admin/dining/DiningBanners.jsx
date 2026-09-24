import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, EyeOff, ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { diningErrorMessage, validateImageFile } from "@food/utils/dining"

const emptyForm = { title: "", subtitle: "", ctaText: "", link: "", sortOrder: "", isActive: true }

export default function DiningBanners() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState("")
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

  // Object URLs are revoked on replace/unmount so previews never leak memory.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const setPreview = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url && url.startsWith("blob:") ? url : ""
    setImagePreview(url)
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setImageFile(null)
    setPreview("")
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (banner) => {
    setEditing(banner)
    setForm({
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      ctaText: banner.ctaText || "",
      link: banner.link || "",
      sortOrder: banner.sortOrder ?? "",
      isActive: banner.isActive !== false,
    })
    setImageFile(null)
    setPreview(banner.image || "")
    setErrors({})
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
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
    if (form.link.trim() && !/^(https?:\/\/|\/)/.test(form.link.trim())) {
      next.link = "Link must start with http(s):// or /"
    }
    if (form.sortOrder !== "" && Number(form.sortOrder) < 0) {
      next.sortOrder = "Display order cannot be negative"
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
    if (form.sortOrder !== "") formData.append("sortOrder", String(Number(form.sortOrder)))
    if (imageFile) formData.append("image", imageFile)

    setSaving(true)
    try {
      if (editing) {
        await diningAPI.admin.updateBanner(editing.id, formData)
        toast.success("Dining banner updated")
      } else {
        await diningAPI.admin.createBanner(formData)
        toast.success("Dining banner added")
      }
      setModalOpen(false)
      setPreview("")
      setImageFile(null)
      await loadBanners()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to save dining banner"))
    } finally {
      setSaving(false)
    }
  }

  /** Active/inactive is the only visibility control — no scheduling. */
  const toggleActive = async (banner) => {
    const nextActive = !banner.isActive
    setBusyId(banner.id)
    setBanners((prev) =>
      prev.map((row) => (row.id === banner.id ? { ...row, isActive: nextActive } : row)),
    )
    try {
      const formData = new FormData()
      formData.append("isActive", String(nextActive))
      await diningAPI.admin.updateBanner(banner.id, formData)
      toast.success(nextActive ? "Banner is now live" : "Banner hidden from users")
    } catch (error) {
      setBanners((prev) =>
        prev.map((row) => (row.id === banner.id ? { ...row, isActive: banner.isActive } : row)),
      )
      toast.error(diningErrorMessage(error, "Failed to update banner"))
    } finally {
      setBusyId("")
    }
  }

  const handleDelete = async (banner) => {
    if (!window.confirm(`Delete banner "${banner.title}"? This cannot be undone.`)) return
    setBusyId(banner.id)
    try {
      await diningAPI.admin.deleteBanner(banner.id)
      toast.success("Dining banner deleted")
      await loadBanners()
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to delete banner"))
    } finally {
      setBusyId("")
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Dining Banners</h1>
          <p className="mt-1 text-sm text-slate-500">
            Add as many banners as you need. Active banners appear on the user dining page in display
            order — there is no start/end date.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition"
        >
          <Plus className="h-4 w-4" /> Add Banner
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading banners…
        </div>
      ) : banners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-500">
          <ImageIcon className="h-8 w-8 text-slate-300" />
          <p className="text-sm">No dining banners yet</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Add your first banner
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <div key={banner.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative aspect-[12/5] bg-slate-100">
                <img
                  src={banner.image}
                  alt={banner.title}
                  loading="lazy"
                  className={`h-full w-full object-cover ${banner.isActive ? "" : "opacity-50 grayscale"}`}
                />
                <span
                  className={`absolute right-2 top-2 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    banner.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-300"
                  }`}
                >
                  {banner.isActive ? "Live" : "Hidden"}
                </span>
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                  #{banner.sortOrder ?? 0}
                </span>
              </div>

              <div className="space-y-2 p-4">
                <h3 className="font-semibold text-slate-900">{banner.title}</h3>
                <p className="line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
                  {banner.subtitle || "-"}
                </p>
                {banner.link && (
                  <p className="truncate text-xs text-slate-400">
                    {banner.ctaText ? `${banner.ctaText} → ` : ""}
                    {banner.link}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleActive(banner)}
                    disabled={busyId === banner.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {banner.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {banner.isActive ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(banner)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(banner)}
                    disabled={busyId === banner.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {busyId === banner.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {editing ? "Edit dining banner" : "Add dining banner"}
              </h2>
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
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-300">
                      <Upload className="h-7 w-7" />
                      <span className="text-xs">Recommended 1200×500</span>
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
                  {imagePreview ? "Change image" : "Upload image"}
                </button>
                <p className="mt-1 text-xs text-slate-400">PNG, JPG or WEBP · max 5MB</p>
                {errors.image && <p className="mt-1 text-xs text-rose-600">{errors.image}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="e.g. Dine out at the best tables in town"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
                {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subtitle</label>
                <input
                  value={form.subtitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
                  placeholder="Short supporting line"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Display order</label>
                  <input
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    placeholder="Auto"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                  {errors.sortOrder && <p className="mt-1 text-xs text-rose-600">{errors.sortOrder}</p>}
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 accent-orange-500"
                    />
                    Active (visible to users)
                  </label>
                </div>
              </div>

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
                  {editing ? "Save changes" : "Add banner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
