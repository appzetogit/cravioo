import { memo, useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { userAPI } from "@food/api";

const CACHE_TTL_MS = 5 * 60 * 1000;
let mutualCache = null; // { at, data } — session-level, cleared on reload

const readUsers = (res) => res?.data?.data ?? res?.data ?? {};

const getInitial = (label) => (String(label || "?").trim().charAt(0) || "?").toUpperCase();

const MutualSection = memo(() => {
  const [state, setState] = useState(() =>
    mutualCache && Date.now() - mutualCache.at < CACHE_TTL_MS
      ? { status: "ready", data: mutualCache.data }
      : { status: "loading", data: null },
  );

  const load = useCallback(async () => {
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading", data: null }));
    try {
      const data = readUsers(await userAPI.getMutualUsers());
      mutualCache = { at: Date.now(), data };
      setState({ status: "ready", data });
    } catch {
      setState({ status: "error", data: null });
    }
  }, []);

  useEffect(() => {
    if (state.status === "loading") load();
    // Runs once on mount; retries go through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const users = state.data?.users || [];
  const isSynced = Boolean(state.data?.isSynced);

  return (
    <section className="px-4 py-2 sm:py-3 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-[#EB590E]" />
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Mutual</h2>
      </div>

      {state.status === "loading" && (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 w-24 shrink-0 rounded-2xl bg-gray-100 dark:bg-[#1a1a1a] animate-pulse" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-sm text-gray-600 dark:text-gray-300">
          Couldn&apos;t load your contacts on Cravioo.{" "}
          <button type="button" onClick={load} className="font-semibold text-[#EB590E]">
            Retry
          </button>
        </div>
      )}

      {state.status === "ready" && !isSynced && (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Find people you know on Cravioo</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Allow contact access to discover people from your contacts who use Cravioo.
            {state.data?.permissionStatus === "DENIED" && " You can enable it from your device settings."}
          </p>
        </div>
      )}

      {state.status === "ready" && isSynced && users.length === 0 && (
        <p className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">
          No contacts on Cravioo yet
        </p>
      )}

      {state.status === "ready" && users.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {users.map((u) => {
            const label = u.contactName || u.name || "Cravioo user";
            return (
              <div
                key={u.userId}
                className="w-24 shrink-0 rounded-2xl border border-gray-100 dark:border-gray-800 p-2 text-center"
              >
                {u.profileImage ? (
                  <img
                    src={u.profileImage}
                    alt=""
                    loading="lazy"
                    className="mx-auto h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-base font-bold text-[#EB590E]">
                    {getInitial(label)}
                  </div>
                )}
                <p className="mt-1 truncate text-xs font-semibold text-gray-900 dark:text-white">{label}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {u.orderCount} completed {u.orderCount === 1 ? "order" : "orders"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});

MutualSection.displayName = "MutualSection";

export default MutualSection;
