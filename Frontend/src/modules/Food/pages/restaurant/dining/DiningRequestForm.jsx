import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ImagePlus, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { diningAPI } from "@food/api"
import { diningErrorMessage, validateImageFile } from "@food/utils/dining"

const MAX_GALLERY = 10

const emptyForm = {
  about: "",
  costForTwo: "",
  seatingCapacity: "",
  contactName: "",
  contactPhone: "",
}

/** Small tag input used for cuisines and amenities. */
function TagInput({ label, placeholder, values, onChange }) {
  const [draft, setDraft] = useState("")

  const addTag = () => {
    const value = draft.trim()
    if (!value) return
    if (values.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setDraft("")
      return
    }
    onChange([...values, value])
    setDraft("")
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
        />
        <button
          type="button"
          onClick={addTag}
          className="rounded-xl border border-gray-200 px-3 text-gray-600 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700"
            >
              {tag}
              <button type="button" onClick={() => onChange(values.filter((item) => item !== tag))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DiningRequestForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(null)
  const [availableCategories, setAvailableCategories] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [cuisines, setCuisines] = useState([])
  const [amenities, setAmenities] = useState([])
  const [errors, setErrors] = useState({})

  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState("")
  const [galleryFiles, setGalleryFiles] = useState([])
  const [existingGallery, setExistingGallery] = useState([])
  const [removedGallery, setRemovedGallery] = useState([])
  const [menuFiles, setMenuFiles] = useState([])
  const [existingMenu, setExistingMenu] = useState([])
  const [removedMenu, setRemovedMenu] = useState([])

  const coverInputRef = useRef(null)
  const galleryInputRef = useRef(null)
  const menuInputRef = useRef(null)
  const objectUrlsRef = useRef([])

  const trackUrl = (url) => {
    objectUrlsRef.current.push(url)
    return url
  }

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const loadProfile = useCallback(async () => {
    setLoading(true)
    try {
      const res = await diningAPI.restaurant.getProfile()
      const data = res?.data?.data
      setAvailableCategories(data?.availableCategories || [])

      const existing = data?.profile
      if (existing) {
        setProfile(existing)
        setForm({
          about: existing.about || "",
          costForTwo: existing.costForTwo ?? "",
          seatingCapacity: existing.seatingCapacity ?? "",
          contactName: existing.contactName || "",
          contactPhone: existing.contactPhone || "",
        })
        setSelectedCategories((existing.categories || []).map((category) => category.id))
        setCuisines(existing.cuisines || [])
        setAmenities(existing.amenities || [])
        setCoverPreview(existing.coverImage || "")
        setExistingGallery(existing.gallery || [])
        setExistingMenu(existing.menuImages || [])
      }
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to load dining details"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const galleryCount = useMemo(
    () => existingGallery.length + galleryFiles.length,
    [existingGallery.length, galleryFiles.length],
  )

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const imageError = validateImageFile(file)
    if (imageError) {
      setErrors((prev) => ({ ...prev, coverImage: imageError }))
      return
    }
    setCoverFile(file)
    setCoverPreview(trackUrl(URL.createObjectURL(file)))
    setErrors((prev) => ({ ...prev, coverImage: "" }))
  }

  const handleMultiChange = (event, { files, setFiles, currentCount, field }) => {
    const picked = Array.from(event.target.files || [])
    if (picked.length === 0) return

    const accepted = []
    for (const file of picked) {
      const imageError = validateImageFile(file)
      if (imageError) {
        setErrors((prev) => ({ ...prev, [field]: imageError }))
        continue
      }
      if (currentCount + accepted.length >= MAX_GALLERY) {
        setErrors((prev) => ({ ...prev, [field]: `Maximum ${MAX_GALLERY} images` }))
        break
      }
      accepted.push({ file, preview: trackUrl(URL.createObjectURL(file)) })
    }
    if (accepted.length > 0) {
      setFiles([...files, ...accepted])
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
    event.target.value = ""
  }

  const validate = () => {
    const next = {}
    if (selectedCategories.length === 0) next.categories = "Select at least one dining category"
    if (form.about.trim().length < 20) next.about = "Tell guests about your dining space (min 20 characters)"
    if (!(Number(form.costForTwo) >= 0) || form.costForTwo === "") next.costForTwo = "Enter cost for two"
    if (!(Number(form.seatingCapacity) >= 1)) next.seatingCapacity = "Enter total seating capacity"
    if (form.contactName.trim().length < 2) next.contactName = "Enter a contact name"
    if (!/^[0-9]{10}$/.test(form.contactPhone.trim())) next.contactPhone = "Enter a valid 10 digit phone"
    if (!coverPreview) next.coverImage = "Cover image is required"
    if (galleryCount < 1) next.gallery = "Add at least one gallery image"
    setErrors(next)
    if (Object.keys(next).length > 0) {
      toast.error("Please fix the highlighted fields")
      return false
    }
    return true
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    const formData = new FormData()
    formData.append("about", form.about.trim())
    formData.append("costForTwo", String(Number(form.costForTwo)))
    formData.append("seatingCapacity", String(Number(form.seatingCapacity)))
    formData.append("contactName", form.contactName.trim())
    formData.append("contactPhone", form.contactPhone.trim())
    formData.append("categories", JSON.stringify(selectedCategories))
    formData.append("cuisines", JSON.stringify(cuisines))
    formData.append("amenities", JSON.stringify(amenities))
    formData.append("removeGalleryUrls", JSON.stringify(removedGallery))
    formData.append("removeMenuImageUrls", JSON.stringify(removedMenu))
    if (coverFile) formData.append("coverImage", coverFile)
    galleryFiles.forEach((item) => formData.append("gallery", item.file))
    menuFiles.forEach((item) => formData.append("menuImages", item.file))

    setSaving(true)
    try {
      await diningAPI.restaurant.submitProfile(formData)
      toast.success(
        profile?.status === "approved"
          ? "Dining details updated"
          : "Dining request sent for approval",
      )
      navigate("/restaurant/dining")
    } catch (error) {
      toast.error(diningErrorMessage(error, "Failed to submit dining request"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-1.5 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">
          {profile ? "Edit dining details" : "Dining request"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        {/* Cover image */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="mb-1 font-medium text-gray-900">
            Cover image <span className="text-rose-500">*</span>
          </h2>
          <p className="mb-3 text-sm text-gray-500">The hero shot guests see first.</p>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="block aspect-[16/7] w-full overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50"
          >
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-gray-400">
                <ImagePlus className="h-7 w-7" />
                <span className="text-sm">Upload cover image</span>
              </span>
            )}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={handleCoverChange}
            className="hidden"
          />
          {errors.coverImage && <p className="mt-1 text-xs text-rose-600">{errors.coverImage}</p>}
        </section>

        {/* Gallery */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="mb-1 font-medium text-gray-900">
            Ambience photos <span className="text-rose-500">*</span>
          </h2>
          <p className="mb-3 text-sm text-gray-500">{galleryCount}/{MAX_GALLERY} added</p>
          <div className="grid grid-cols-3 gap-2">
            {existingGallery.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-gray-200">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setExistingGallery((prev) => prev.filter((item) => item !== url))
                    setRemovedGallery((prev) => [...prev, url])
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {galleryFiles.map((item) => (
              <div
                key={item.preview}
                className="relative aspect-square overflow-hidden rounded-xl border border-gray-200"
              >
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setGalleryFiles((prev) => prev.filter((file) => file.preview !== item.preview))
                  }
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {galleryCount < MAX_GALLERY && (
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400"
              >
                <ImagePlus className="h-6 w-6" />
              </button>
            )}
          </div>
          <input
            ref={galleryInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) =>
              handleMultiChange(event, {
                files: galleryFiles,
                setFiles: setGalleryFiles,
                currentCount: galleryCount,
                field: "gallery",
              })
            }
            className="hidden"
          />
          {errors.gallery && <p className="mt-1 text-xs text-rose-600">{errors.gallery}</p>}
        </section>

        {/* Categories */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="mb-1 font-medium text-gray-900">
            Dining categories <span className="text-rose-500">*</span>
          </h2>
          <p className="mb-3 text-sm text-gray-500">Chosen from the categories admin has published.</p>
          <div className="flex flex-wrap gap-2">
            {availableCategories.map((category) => {
              const active = selectedCategories.includes(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setSelectedCategories((prev) =>
                      active ? prev.filter((id) => id !== category.id) : [...prev, category.id],
                    )
                  }
                  className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${
                    active
                      ? "border-orange-300 bg-orange-50 text-orange-700"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  <img src={category.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                  {category.name}
                </button>
              )
            })}
          </div>
          {availableCategories.length === 0 && (
            <p className="text-sm text-gray-500">No dining categories published yet.</p>
          )}
          {errors.categories && <p className="mt-1 text-xs text-rose-600">{errors.categories}</p>}
        </section>

        {/* Details */}
        <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              About your dining <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={form.about}
              onChange={(event) => setForm((prev) => ({ ...prev, about: event.target.value }))}
              placeholder="Ambience, seating experience, what makes it special…"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
            />
            {errors.about && <p className="mt-1 text-xs text-rose-600">{errors.about}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Cost for two (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.costForTwo}
                onChange={(event) => setForm((prev) => ({ ...prev, costForTwo: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
              {errors.costForTwo && <p className="mt-1 text-xs text-rose-600">{errors.costForTwo}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Total seats <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={form.seatingCapacity}
                onChange={(event) => setForm((prev) => ({ ...prev, seatingCapacity: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
              {errors.seatingCapacity && (
                <p className="mt-1 text-xs text-rose-600">{errors.seatingCapacity}</p>
              )}
            </div>
          </div>

          <TagInput label="Cuisines" placeholder="e.g. North Indian" values={cuisines} onChange={setCuisines} />
          <TagInput
            label="Amenities"
            placeholder="e.g. Valet parking"
            values={amenities}
            onChange={setAmenities}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Contact name <span className="text-rose-500">*</span>
              </label>
              <input
                value={form.contactName}
                onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
              {errors.contactName && <p className="mt-1 text-xs text-rose-600">{errors.contactName}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Contact phone <span className="text-rose-500">*</span>
              </label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={form.contactPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contactPhone: event.target.value.replace(/\D/g, "") }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
              />
              {errors.contactPhone && <p className="mt-1 text-xs text-rose-600">{errors.contactPhone}</p>}
            </div>
          </div>
        </section>

        {/* Menu images */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="mb-1 font-medium text-gray-900">Menu images</h2>
          <p className="mb-3 text-sm text-gray-500">Optional — helps guests plan before they arrive.</p>
          <div className="grid grid-cols-3 gap-2">
            {existingMenu.map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-gray-200">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setExistingMenu((prev) => prev.filter((item) => item !== url))
                    setRemovedMenu((prev) => [...prev, url])
                  }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {menuFiles.map((item) => (
              <div
                key={item.preview}
                className="relative aspect-square overflow-hidden rounded-xl border border-gray-200"
              >
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setMenuFiles((prev) => prev.filter((file) => file.preview !== item.preview))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {existingMenu.length + menuFiles.length < MAX_GALLERY && (
              <button
                type="button"
                onClick={() => menuInputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400"
              >
                <ImagePlus className="h-6 w-6" />
              </button>
            )}
          </div>
          <input
            ref={menuInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) =>
              handleMultiChange(event, {
                files: menuFiles,
                setFiles: setMenuFiles,
                currentCount: existingMenu.length + menuFiles.length,
                field: "menuImages",
              })
            }
            className="hidden"
          />
          {errors.menuImages && <p className="mt-1 text-xs text-rose-600">{errors.menuImages}</p>}
        </section>

        <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-white p-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {profile?.status === "approved" ? "Save changes" : "Submit dining request"}
          </button>
        </div>
      </form>
    </div>
  )
}
