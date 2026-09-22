'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { extractResortPricingTiers, PricingTier } from '@/lib/pricing';

interface PartnerPricingTiersProps {
  resortId: string;
  resortData: any;
  partnerData?: any;
  onUpdateSuccess: () => void;
}

export default function PartnerPricingTiers({
  resortId,
  resortData,
  partnerData,
  onUpdateSuccess,
}: PartnerPricingTiersProps) {
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [editableTiers, setEditableTiers] = useState<PricingTier[]>([]);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch resort_schema, extract tiers & check for pending approval requests
  useEffect(() => {
    if (!resortData) return;

    const fetchSchemaAndPendingRequests = async () => {
      setLoadingSchema(true);
      try {
        // 1. Fetch Resort Schema Structure
        const schemaSnap = await getDoc(doc(db, 'schemas', 'resort_schema'));
        let schemaTree: any[] = [];
        if (schemaSnap.exists()) {
          schemaTree = schemaSnap.data().structure || [];
        }

        const extracted = extractResortPricingTiers(resortData, schemaTree);

        if (extracted.length > 0) {
          setEditableTiers(extracted);
        } else {
          // Fallback default tier if resort has no tiers in database yet
          setEditableTiers([{ min: 1, max: 200, price: Number(resortData.core_base_price || 8500) }]);
        }

        // 2. Check for pending Super Admin approval requests
        const reqQ = query(
          collection(db, 'partner_approval_requests'),
          where('resortId', '==', resortId),
          where('status', '==', 'pending')
        );
        const reqSnap = await getDocs(reqQ);

        if (!reqSnap.empty) {
          setPendingRequest(reqSnap.docs[0].data());
        } else {
          setPendingRequest(null);
        }
      } catch (err) {
        console.error('Error fetching tiers or pending requests:', err);
      } finally {
        setLoadingSchema(false);
      }
    };

    fetchSchemaAndPendingRequests();
  }, [resortData, resortId]);

  // Handle Input Changes for a Tier
  const handleTierChange = (index: number, field: keyof PricingTier, value: number) => {
    setEditableTiers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Add New Tier (Auto-calculates next non-clashing minimum)
  const handleAddNewTier = () => {
    setEditableTiers((prev) => {
      const sorted = [...prev].sort((a, b) => a.min - b.min);
      const lastTier = sorted[sorted.length - 1];

      const nextMin = lastTier ? lastTier.max + 1 : 1;
      const nextMax = nextMin + 100;
      const nextPrice = lastTier ? Math.max(1000, lastTier.price - 500) : 7500;

      return [...sorted, { min: nextMin, max: nextMax, price: nextPrice }];
    });
  };

  // Delete Tier (Enforces at least 1 tier)
  const handleDeleteTier = (index: number) => {
    if (editableTiers.length <= 1) {
      alert('⚠️ At least 1 pricing tier is required.');
      return;
    }
    setEditableTiers((prev) => prev.filter((_, idx) => idx !== index));
  };

  // STRICT TIER VALIDATION (NO CLASHING / OVERLAPPING ALLOWED)
  const validateTiers = (tierList: PricingTier[]): string | null => {
    if (!tierList || tierList.length === 0) {
      return '⚠️ At least 1 pricing tier is required.';
    }

    const sorted = [...tierList].sort((a, b) => a.min - b.min);

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];

      if (current.min < 1) {
        return `⚠️ Tier #${i + 1}: Minimum guest count must be at least 1.`;
      }

      if (current.min >= current.max) {
        return `⚠️ Tier #${i + 1}: Minimum guests (${current.min}) must be less than maximum guests (${current.max}).`;
      }

      if (current.price <= 0) {
        return `⚠️ Tier #${i + 1}: Price per person must be greater than ₹0.`;
      }

      // Check overlap with previous tier
      if (i > 0) {
        const previous = sorted[i - 1];
        if (current.min <= previous.max) {
          return `⚠️ Guest Range Clash! Tier #${i + 1} (${current.min}–${current.max} guests) overlaps with Tier #${i} (${previous.min}–${previous.max} guests). Tier #${i + 1} minimum guests must be at least ${previous.max + 1}.`;
        }
      }
    }

    return null; // All valid!
  };

  // SUBMIT FOR SUPER ADMIN APPROVAL
  const handleSubmitTiersForApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // 1. Run Range & Clash Validations
    const errorMsg = validateTiers(editableTiers);
    if (errorMsg) {
      setMessage({ type: 'error', text: errorMsg });
      return;
    }

    setSaving(true);

    try {
      const requestId = `req_pricing_${resortId}_${Date.now()}`;

      // Submit Pending Approval Request to Firestore
      const requestPayload = {
        id: requestId,
        resortId: resortId,
        resortName: resortData._recordName || resortData.core_name || 'Resort',
        partnerId: partnerData?.id || partnerData?.uid || 'partner_id',
        partnerName: partnerData?.partnerName || 'Resort Partner',
        type: 'pricing_tier_update',
        proposedTiers: editableTiers,
        status: 'pending', // Pending Super Admin Review
        submittedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'partner_approval_requests', requestId), requestPayload);

      setPendingRequest(requestPayload);
      setMessage({
        type: 'success',
        text: '✅ Pricing changes submitted! Pending Super Admin approval before going live.',
      });
      onUpdateSuccess();
    } catch (err: any) {
      console.error('Error submitting approval request:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to submit approval request.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingSchema) {
    return (
      <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
        <i className="ph-bold ph-spinner animate-spin text-2xl mb-2 text-[#6B0D24] block mx-auto"></i>
        Loading Pricing Tier Engine...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900">
            Guest Volume Tier Pricing
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Configure per-person rates for guest capacity ranges.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddNewTier}
          className="bg-[#FAF6F0] text-[#6B0D24] hover:bg-[#6B0D24] hover:text-white border border-[#6B0D24]/20 font-bold px-4 py-2 rounded-xl text-xs transition inline-flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          <i className="ph-bold ph-plus text-sm"></i> Add New Tier
        </button>
      </div>

      {/* PENDING APPROVAL NOTICE BANNER */}
      {pendingRequest && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-medium space-y-1">
          <div className="flex items-center gap-2 font-black text-amber-950">
            <i className="ph-bold ph-hourglass text-base text-amber-600 animate-pulse"></i>
            <span>Pending Super Admin Approval</span>
          </div>
          <p>
            You submitted pricing tier changes on{' '}
            <strong>{new Date(pendingRequest.submittedAt).toLocaleString()}</strong>. Changes will go live once reviewed by Super Admin.
          </p>
        </div>
      )}

      {/* ALERT MESSAGE */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <i
            className={`text-base ph-bold ${
              message.type === 'success' ? 'ph-check-circle text-green-600' : 'ph-warning-circle text-red-600'
            }`}
          ></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* EDITABLE TIERS FORM */}
      <form onSubmit={handleSubmitTiersForApproval} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {editableTiers.map((tier, idx) => (
            <div
              key={idx}
              className="bg-white border border-gray-200 p-5 rounded-2xl space-y-4 shadow-2xs relative group"
            >
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059]">
                  Tier #{idx + 1}
                </span>

                {editableTiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTier(idx)}
                    className="text-gray-400 hover:text-red-600 text-xs font-bold transition p-1"
                    title="Delete Tier"
                  >
                    <i className="ph-bold ph-trash text-sm"></i> Delete
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Min Guests
                  </label>
                  <input
                    type="number"
                    value={tier.min}
                    onChange={(e) =>
                      handleTierChange(idx, 'min', parseInt(e.target.value) || 1)
                    }
                    min="1"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-xs outline-none focus:border-[#6B0D24] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Max Guests
                  </label>
                  <input
                    type="number"
                    value={tier.max}
                    onChange={(e) =>
                      handleTierChange(idx, 'max', parseInt(e.target.value) || 1)
                    }
                    min="1"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-xs outline-none focus:border-[#6B0D24] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                  Rate / Person / Night (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center font-black text-gray-400 text-xs">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={tier.price}
                    onChange={(e) =>
                      handleTierChange(idx, 'price', parseInt(e.target.value) || 0)
                    }
                    min="100"
                    step="100"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 pl-8 font-black text-sm text-[#6B0D24] outline-none focus:border-[#6B0D24] focus:bg-white"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[11px] text-gray-400 font-medium">
            * All changes are routed to Super Admin for validation before live deployment.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-8 py-4 rounded-2xl text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <i className="ph-bold ph-spinner animate-spin text-base"></i> Submitting...
              </>
            ) : (
              <>
                <i className="ph-bold ph-paper-plane-tilt text-base text-[#C5A059]"></i> Submit for Admin Approval
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}