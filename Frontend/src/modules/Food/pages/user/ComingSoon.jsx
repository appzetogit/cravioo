import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ChefHat, Utensils, Store, Bike, Heart } from "lucide-react"

const FEATURES = [
  { Icon: Utensils, label: "Delicious Food" },
  { Icon: Store, label: "Top Restaurants" },
  { Icon: Bike, label: "Fast Delivery" },
  { Icon: Heart, label: "Great Experience" },
]

const BACKGROUND_IMAGE =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&q=80"

/**
 * Admin-controlled full-screen block for the User app. Shown to every logged-in
 * customer when GlobalSettings.userComingSoonEnabled is true — nothing else in
 * the user app is reachable while this is on (see the gates in UserRouter.jsx
 * and app/routes.jsx).
 *
 * appName/logoUrl are passed in as props (rather than this component calling
 * useSettings() itself) since this is lazy-loaded into its own chunk — the
 * parent gates already have settings loaded, so this avoids any risk of a
 * duplicated SettingsContext module instance across chunk boundaries.
 */
export default function ComingSoon({ appName: appNameProp, logoUrl }) {
  const appName = appNameProp || "Cravioo"

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center px-6 py-16">
      {/* Food photography backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${BACKGROUND_IMAGE}')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/75 to-black/90" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/60" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 max-w-2xl w-full text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="mx-auto mb-7 w-24 h-24 rounded-[1.5rem] bg-white shadow-[0_0_60px_rgba(50,196,90,0.35)] flex items-center justify-center p-4"
        >
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="w-full h-full object-contain" />
          ) : (
            <span className="text-3xl font-black text-[#32C45A]">{appName}</span>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-[0.2em] text-[#8be9a8] mb-6"
        >
          <ChefHat className="w-3.5 h-3.5" />
          Something fresh is cooking
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight mb-5 font-sans"
          style={{ fontFamily: "'Baloo 2', 'Poppins', sans-serif" }}
        >
          <span className="text-white">Coming </span>
          <span className="bg-gradient-to-r from-[#ffd166] to-[#ff9a3c] bg-clip-text text-transparent">
            Soon
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-lg md:text-xl text-white font-semibold mb-2"
        >
          We're cooking up something amazing for you!
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-sm md:text-base text-white/60 leading-relaxed mb-10 max-w-md mx-auto"
        >
          A better food experience with your favorite restaurants, delicious meals and more —
          launching soon.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex items-center justify-center gap-6 md:gap-10 mb-10 flex-wrap"
        >
          {FEATURES.map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm flex items-center justify-center">
                <Icon className="w-6 h-6 text-white/90" />
              </div>
              <span className="text-xs text-white/70 font-medium">{label}</span>
            </div>
          ))}
        </motion.div>

        <Link
          to="/food/user/profile/logout"
          className="inline-block text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
        >
          Log out
        </Link>
      </motion.div>
    </div>
  )
}
