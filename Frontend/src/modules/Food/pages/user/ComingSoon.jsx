import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Sparkles, LogOut } from "lucide-react"
import { useSettings } from "@core/context/SettingsContext"

/**
 * Admin-controlled full-screen block for the User app. Shown to every logged-in
 * customer when GlobalSettings.userComingSoonEnabled is true — nothing else in
 * the user app is reachable while this is on (see the gates in UserRouter.jsx
 * and app/routes.jsx).
 */
export default function ComingSoon() {
  const { settings } = useSettings()
  const appName = settings?.appName || settings?.companyName || "Cravioo"
  const logoUrl = settings?.logoUrl

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center px-6 bg-[#0b1220]">
      {/* Animated gradient backdrop */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(50,196,90,0.35), transparent 45%)," +
            "radial-gradient(circle at 85% 15%, rgba(255,149,0,0.3), transparent 45%)," +
            "radial-gradient(circle at 50% 85%, rgba(99,102,241,0.35), transparent 50%)," +
            "linear-gradient(135deg, #0b1220 0%, #121a2b 50%, #0b1220 100%)",
        }}
      />

      {/* Slowly drifting glow blobs */}
      <motion.div
        className="absolute w-[32rem] h-[32rem] rounded-full bg-[#32C45A]/20 blur-3xl"
        style={{ top: "-8rem", left: "-8rem" }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[28rem] h-[28rem] rounded-full bg-orange-400/20 blur-3xl"
        style={{ bottom: "-6rem", right: "-6rem" }}
        animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[20rem] h-[20rem] rounded-full bg-indigo-400/20 blur-3xl"
        style={{ top: "40%", left: "55%" }}
        animate={{ x: [0, 20, 0], y: [0, -25, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating sparkles */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-white/20"
          style={{
            top: `${(i * 37) % 90}%`,
            left: `${(i * 53) % 95}%`,
          }}
          animate={{ opacity: [0.1, 0.5, 0.1], y: [0, -12, 0] }}
          transition={{ duration: 4 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
        >
          <Sparkles className="w-4 h-4" />
        </motion.div>
      ))}

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 max-w-lg w-full text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="mx-auto mb-8 w-28 h-28 rounded-[1.75rem] bg-white/95 shadow-[0_0_60px_rgba(50,196,90,0.35)] flex items-center justify-center p-4"
        >
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="w-full h-full object-contain" />
          ) : (
            <span className="text-3xl font-black text-[#32C45A]">
              {appName.slice(0, 1)}
            </span>
          )}
        </motion.div>

        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/10 text-[11px] font-bold uppercase tracking-[0.2em] text-[#8be9a8] mb-6"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Something fresh is cooking
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
          {appName} is taking a short break
        </h1>
        <p className="text-sm md:text-base text-white/60 leading-relaxed mb-10 max-w-sm mx-auto">
          We're polishing things up to bring you a better experience. We'll be back online shortly —
          thanks for your patience!
        </p>

        <Link
          to="/food/user/profile/logout"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log out
        </Link>
      </motion.div>
    </div>
  )
}
