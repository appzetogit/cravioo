import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Store, Trash2 } from "lucide-react";
import { restaurantAPI } from "@food/api";
import { setAuthData } from "@food/utils/auth";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@food/components/ui/dialog";
import {
  cacheOutletNames,
  getRestaurantOrdersScope,
  setRestaurantOrdersScope,
} from "@food/utils/restaurantOrdersScope";

const STATUS_LABEL = {
  approved: { text: "Live", cls: "bg-green-100 text-green-700" },
  pending: { text: "Under review", cls: "bg-amber-100 text-amber-700" },
  onboarding: { text: "Onboarding pending", cls: "bg-slate-100 text-slate-700" },
  rejected: { text: "Rejected", cls: "bg-red-100 text-red-700" },
};

export default function OutletSwitcher() {
  const [outlets, setOutlets] = useState([]);
  const [activeOutletId, setActiveOutletId] = useState("");
  const [scope, setScope] = useState(getRestaurantOrdersScope());
  const [busy, setBusy] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [names, setNames] = useState([""]);

  const loadOutlets = () =>
    restaurantAPI
      .listOutlets()
      .then((res) => {
        const list = res?.data?.data?.outlets || [];
        setOutlets(list);
        cacheOutletNames(list);
        setActiveOutletId(res?.data?.data?.activeOutletId || "");
      })
      .catch(() => {});

  useEffect(() => {
    loadOutlets();
  }, []);

  const applySession = (session) => {
    if (!session?.accessToken) throw new Error("Could not switch outlet");
    setAuthData("restaurant", session.accessToken, session.user, session.refreshToken);
  };

  const handleSwitch = async (outletId) => {
    if (!outletId || outletId === activeOutletId || busy) return;
    try {
      setBusy(true);
      const res = await restaurantAPI.switchOutlet(outletId);
      applySession(res?.data?.data);
      window.location.reload();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Could not switch outlet");
      setBusy(false);
    }
  };

  const handleScopeChange = (nextScope) => {
    setRestaurantOrdersScope(nextScope);
    setScope(nextScope);
    window.location.reload();
  };

  const cleanedNames = names.map((n) => n.trim()).filter(Boolean);

  const handleCreateOutlets = async () => {
    if (!cleanedNames.length || busy) return;
    try {
      setBusy(true);
      const res = await restaurantAPI.addOutlets(cleanedNames);
      const { created = [], failed = [] } = res?.data?.data || {};
      if (created.length) toast.success(`${created.length} outlet(s) added. Complete each one's onboarding.`);
      failed.forEach((f) => toast.error(`${f.name}: ${f.message}`));
      setShowAddDialog(false);
      setNames([""]);
      await loadOutlets();
      setShowListDialog(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Could not add outlets");
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteOnboarding = async (outletId) => {
    if (busy) return;
    try {
      setBusy(true);
      const tokenRes = await restaurantAPI.getOutletOnboardingToken(outletId);
      const registrationToken = tokenRes?.data?.data?.registrationToken;
      if (!registrationToken) throw new Error("Could not open onboarding for this outlet");
      const session = await restaurantAPI.switchOutlet(outletId);
      applySession(session?.data?.data);
      sessionStorage.setItem("restaurant_registrationToken", registrationToken);
      window.location.href = "/food/restaurant/onboarding?step=1";
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Could not open onboarding");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 text-sm">
      {outlets.length > 1 && (
        <select
          value={activeOutletId}
          onChange={(e) => handleSwitch(e.target.value)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-800"
          aria-label="Select outlet"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.restaurantName}
              {o.status !== "approved" ? ` (${o.status})` : ""}
            </option>
          ))}
        </select>
      )}

      {outlets.length > 1 && (
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          <button
            type="button"
            onClick={() => handleScopeChange("outlet")}
            className={`px-3 py-1 ${scope === "outlet" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
          >
            This outlet
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange("all")}
            className={`px-3 py-1 ${scope === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
          >
            All outlets
          </button>
        </div>
      )}

      {outlets.length > 1 && (
        <Button type="button" size="sm" variant="outline" onClick={() => setShowListDialog(true)}>
          My outlets
        </Button>
      )}

      <Button
        type="button"
        size="sm"
        onClick={() => {
          setNames([""]);
          setShowAddDialog(true);
        }}
        disabled={busy}
        className="ml-auto bg-[#32C45A] hover:bg-[#28A047] text-white gap-1.5"
      >
        <Plus className="w-4 h-4" />
        Add outlets
      </Button>

      {/* Add one or more outlets in a single go */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !busy && setShowAddDialog(open)}>
        <DialogContent className="sm:max-w-md p-6 flex flex-col gap-5">
          <DialogHeader className="gap-3 pr-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#32C45A]/10 text-[#32C45A]">
              <Store className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl">Add outlets</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Owner details, PAN, bank and zone carry over from your account. Each outlet is
              submitted for review on its own, so you only enter its location, menu and documents.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {names.map((value, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  autoFocus={idx === names.length - 1}
                  value={value}
                  onChange={(e) => setNames(names.map((n, i) => (i === idx ? e.target.value : n)))}
                  placeholder={`Outlet ${idx + 1} name`}
                  disabled={busy}
                  className="h-11"
                />
                {names.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setNames(names.filter((_, i) => i !== idx))}
                    disabled={busy}
                    className="p-2 text-slate-400 hover:text-red-600"
                    aria-label="Remove outlet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => names.length < 20 && setNames([...names, ""])}
            disabled={busy || names.length >= 20}
            className="self-start text-sm font-semibold text-[#32C45A] disabled:opacity-50"
          >
            + Add another outlet
          </button>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={busy}
              className="h-11 w-full sm:w-auto sm:min-w-28"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateOutlets}
              disabled={busy || cleanedNames.length === 0}
              className="h-11 w-full sm:w-auto sm:min-w-36 bg-[#32C45A] hover:bg-[#28A047] text-white"
            >
              {busy ? "Creating..." : `Create ${cleanedNames.length || ""} outlet${cleanedNames.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Every outlet of this owner, with its own status and onboarding action */}
      <Dialog open={showListDialog} onOpenChange={(open) => !busy && setShowListDialog(open)}>
        <DialogContent className="sm:max-w-lg p-6 flex flex-col gap-4">
          <DialogHeader className="gap-2 pr-8">
            <DialogTitle className="text-xl">My outlets</DialogTitle>
            <DialogDescription className="text-sm">
              Each outlet is reviewed separately by admin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {outlets.map((o) => {
              const badge = STATUS_LABEL[o.status] || { text: o.status, cls: "bg-slate-100 text-slate-700" };
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{o.restaurantName}</p>
                    <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  {o.status === "onboarding" ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleCompleteOnboarding(o.id)}
                      className="bg-[#32C45A] hover:bg-[#28A047] text-white shrink-0"
                    >
                      Complete onboarding
                    </Button>
                  ) : o.id !== activeOutletId ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleSwitch(o.id)} className="shrink-0">
                      Open
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowListDialog(false)} disabled={busy} className="h-11 w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
