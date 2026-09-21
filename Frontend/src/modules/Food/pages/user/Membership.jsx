import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, CalendarClock, CheckCircle2, Crown, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { userAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { getCompanyNameAsync } from "@common/utils/businessSettings"

const UNIT_LABEL = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" }

const formatDuration = (value, unit) => {
  const label = UNIT_LABEL[unit] || String(unit || "").toLowerCase()
  return `${value} ${label}${Number(value) === 1 ? "" : "s"}`
}
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"
const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`

const STATUS_STYLE = {
  active: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-amber-100 text-amber-700",
}

export default function Membership() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState([])
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [buyingPlanId, setBuyingPlanId] = useState(null)

  const applyMembership = (payload) => {
    setCurrent(payload?.current || null)
    setHistory(Array.isArray(payload?.history) ? payload.history : [])
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [plansRes, meRes] = await Promise.all([userAPI.getMembershipPlans(), userAPI.getMyMembership()])
      setPlans(plansRes?.data?.data?.plans || [])
      applyMembership(meRes?.data?.data)
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load membership")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleBuy = async (plan) => {
    if (buyingPlanId) return
    setBuyingPlanId(plan._id)
    try {
      const orderRes = await userAPI.createMembershipOrder(plan._id)
      const { razorpay } = orderRes?.data?.data || {}
      if (!razorpay?.orderId || !razorpay?.key) throw new Error("Invalid payment order")

      let profile = {}
      try {
        const profileRes = await userAPI.getProfile()
        profile = profileRes?.data?.data?.user || {}
      } catch {
        // Prefill is optional.
      }
      const companyName = await getCompanyNameAsync()

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: companyName,
        description: `${plan.name} Membership`,
        prefill: {
          name: profile.name || "",
          email: profile.email || "",
          contact: String(profile.phone || "").replace(/\D/g, "").slice(-10),
        },
        handler: async (response) => {
          try {
            const verifyRes = await userAPI.verifyMembershipPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            applyMembership(verifyRes?.data?.data)
            toast.success("Membership activated!")
          } catch (error) {
            toast.error(
              error?.response?.data?.message ||
                "Payment received but activation is pending. It will activate shortly - contact support if it does not.",
            )
            load()
          } finally {
            setBuyingPlanId(null)
          }
        },
        onError: (error) => {
          toast.error(error?.description || "Payment failed. Please try again.")
          setBuyingPlanId(null)
        },
        onClose: () => setBuyingPlanId(null),
      })
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Could not start payment")
      setBuyingPlanId(null)
    }
  }

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] pb-10">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Membership</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : (
          <>
            {current && (
              <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 mb-6 shadow-md">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-5 w-5" />
                  <span className="text-sm font-semibold uppercase tracking-wide">Active member</span>
                </div>
                <p className="text-2xl font-bold">{current.planName}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-4 w-4" /> Valid till {formatDate(current.expiryDate)}
                  </span>
                  <span className="font-semibold">
                    {current.daysRemaining} day{current.daysRemaining === 1 ? "" : "s"} left
                  </span>
                </div>
                {current.benefits?.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {current.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              {current ? "Plans (available after your membership ends)" : "Choose a plan"}
            </h2>
            {plans.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No membership plans are available right now.</p>
            ) : (
              <div className="space-y-3">
                {plans.map((plan) => (
                  <div
                    key={plan._id}
                    className="rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</p>
                        {plan.description && <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{formatMoney(plan.price)}</p>
                        <p className="text-xs text-gray-500">
                          for {formatDuration(plan.durationValue, plan.durationUnit)}
                        </p>
                      </div>
                    </div>
                    {plan.benefits?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {plan.benefits.map((b) => (
                          <li key={b} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" /> {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button
                      className="w-full mt-4 bg-[#EB590E] hover:bg-[#d24f0c] text-white"
                      disabled={Boolean(current) || Boolean(buyingPlanId)}
                      onClick={() => handleBuy(plan)}
                    >
                      {buyingPlanId === plan._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : current ? (
                        "Already a member"
                      ) : (
                        `Get for ${formatMoney(plan.price)}`
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {history.length > 0 && (
              <>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-8 mb-3">Membership history</h2>
                <div className="space-y-2">
                  {history.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 p-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.planName}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(m.startDate)} - {formatDate(m.expiryDate)} · {formatMoney(m.amountPaid)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${STATUS_STYLE[m.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AnimatedPage>
  )
}
