// components/admin/SponsoredBannersAdmin.tsx
//
// Drop this into the Admin Dashboard as a new tab. Uses the existing
// backend routes (already built): GET/POST /api/admin/sponsored,
// DELETE /api/admin/sponsored/:id.

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Trash2, Plus, ExternalLink, Loader2 } from "lucide-react";
import { API_URL } from "../utils/constants";

interface Banner {
  id: number;
  business_name: string;
  tagline: string;
  link_url: string;
  contact_name: string | null;
  contact_phone: string | null;
  amount_paid: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export default function SponsoredBannersAdmin() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [days, setDays] = useState("30");

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/api/admin/sponsored`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (err) {
      console.error("Failed to load sponsored banners:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const resetForm = () => {
    setBusinessName(""); setTagline(""); setLinkUrl("");
    setContactName(""); setContactPhone(""); setAmountPaid(""); setDays("30");
    setError("");
  };

  const handleCreate = async () => {
    if (!businessName.trim() || !tagline.trim() || !linkUrl.trim()) {
      setError("Business name, tagline, and link are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/api/admin/sponsored`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessName: businessName.trim(),
          tagline: tagline.trim(),
          linkUrl: linkUrl.trim(),
          contactName: contactName.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          amountPaid: amountPaid ? parseFloat(amountPaid) : undefined,
          days: parseInt(days) || 30,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create banner");
      }
      resetForm();
      setShowForm(false);
      fetchBanners();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Remove the "${name}" banner?`)) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      await fetch(`${API_URL}/api/admin/sponsored/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchBanners();
    } catch (err) {
      console.error("Failed to delete banner:", err);
    }
  };

  return (
    <div className="text-white">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Sponsored banners</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add banner
        </button>
      </div>

      {showForm && (
        <div className="bg-[#141414] border border-white/10 rounded-xl p-4 mb-5 space-y-3">
          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Business name *"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Link (website/Instagram/WhatsApp) *"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Tagline — one short line *"
            maxLength={100}
            className="w-full bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Contact phone"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
            <input
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="Amount (₹)"
              type="number"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="Days"
              type="number"
              className="bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving..." : "Create banner"}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : banners.length === 0 ? (
        <p className="text-gray-500 text-sm">No sponsored banners yet.</p>
      ) : (
        <div className="space-y-2">
          {banners.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 bg-[#141414] border border-white/5 rounded-xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{b.business_name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      b.is_active
                        ? "bg-green-500/10 text-green-400"
                        : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    {b.is_active ? "Active" : "Expired"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{b.tagline}</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  {new Date(b.starts_at).toLocaleDateString()} → {new Date(b.ends_at).toLocaleDateString()}
                  {b.amount_paid ? ` • ₹${(b.amount_paid / 100).toFixed(0)}` : ""}
                  {b.contact_name ? ` • ${b.contact_name}` : ""}
                  {b.contact_phone ? ` (${b.contact_phone})` : ""}
                </p>
              </div>
              <a
                href={b.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-white p-1.5"
                title="Open link"
              >
                <ExternalLink size={16} />
              </a>
              <button
                onClick={() => handleDelete(b.id, b.business_name)}
                className="text-gray-500 hover:text-red-400 p-1.5"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}