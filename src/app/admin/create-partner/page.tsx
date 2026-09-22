'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminPartnerNavbar from '@/components/layout/AdminPartnerNavbar';

interface ResortOption {
  id: string;
  name: string;
  location: string;
}

export default function AdminCreatePartnerPage() {
  const [unassignedResorts, setUnassignedResorts] = useState<ResortOption[]>([]);
  const [loadingResorts, setLoadingResorts] = useState(true);

  // Form State
  const [selectedResortId, setSelectedResortId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch unassigned resorts
  const fetchUnassignedResorts = async () => {
    setLoadingResorts(true);
    try {
      const snap = await getDocs(collection(db, 'resort_data'));
      const options: ResortOption[] = [];

      snap.forEach((d) => {
        const data = d.data();
        if (!data.core_hidden && !data.hasPartner) {
          options.push({
            id: d.id,
            name: data._recordName || data.core_name || 'Unnamed Resort',
            location: data.core_location || 'India',
          });
        }
      });

      options.sort((a, b) => a.name.localeCompare(b.name));
      setUnassignedResorts(options);
    } catch (err) {
      console.error('Error fetching unassigned resorts:', err);
    } finally {
      setLoadingResorts(false);
    }
  };

  useEffect(() => {
    fetchUnassignedResorts();
  }, []);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedResortId) {
      setMessage({ type: 'error', text: 'Please select an unassigned resort.' });
      return;
    }
    if (!partnerName.trim() || partnerPhone.length < 10 || !partnerEmail.trim()) {
      setMessage({ type: 'error', text: 'Please enter valid Partner Name, 10-digit Phone, and Email.' });
      return;
    }

    setSaving(true);

    try {
      const targetResort = unassignedResorts.find((r) => r.id === selectedResortId);
      const cleanPhone = partnerPhone.trim().replace(/[^0-9]/g, '');
      const partnerDocId = `partner_${cleanPhone}`;

      // 1. Create Resort Partner record
      await setDoc(doc(db, 'resort_partners', partnerDocId), {
        id: partnerDocId,
        resortId: selectedResortId,
        resortName: targetResort?.name || 'Assigned Resort',
        partnerName: partnerName.trim(),
        phone: cleanPhone,
        email: partnerEmail.trim().toLowerCase(),
        status: 'pending_password',
        createdAt: new Date().toISOString(),
      });

      // 2. Mark resort as having a partner assigned
      await updateDoc(doc(db, 'resort_data', selectedResortId), {
        hasPartner: true,
        partnerId: partnerDocId,
        partnerName: partnerName.trim(),
      });

      setMessage({
        type: 'success',
        text: `Successfully created Resort Partner account for ${partnerName} linked to ${targetResort?.name}!`,
      });

      setSelectedResortId('');
      setPartnerName('');
      setPartnerPhone('');
      setPartnerEmail('');
      await fetchUnassignedResorts();
    } catch (err: any) {
      console.error('Error creating resort partner:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to create Resort Partner.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      {/* SEPARATE ADMIN NAVBAR */}
      <AdminPartnerNavbar portalType="admin" userName="Super Admin" />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 pt-24 md:pt-28 pb-20">
        <div className="bg-white rounded-3xl p-6 md:p-10 border border-gray-100 shadow-sm space-y-8">
          {/* Header */}
          <div className="border-b border-gray-100 pb-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#6B0D24]/10 text-[#6B0D24] flex items-center justify-center text-2xl font-black">
              <i className="ph-fill ph-user-plus"></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] block mb-0.5">
                Command Center &bull; Admin
              </span>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900">
                Create Resort Partner Account
              </h1>
            </div>
          </div>

          {/* Alert Message */}
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

          <form onSubmit={handleCreatePartner} className="space-y-6">
            {/* 1. SELECT RESORT DROPDOWN */}
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                1. Select Unassigned Resort
              </label>
              {loadingResorts ? (
                <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs font-bold text-gray-400 flex items-center gap-2">
                  <i className="ph-bold ph-spinner animate-spin text-base text-[#6B0D24]"></i>
                  Loading unassigned resorts...
                </div>
              ) : (
                <select
                  value={selectedResortId}
                  onChange={(e) => setSelectedResortId(e.target.value)}
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 font-bold text-sm text-gray-900 outline-none focus:border-[#6B0D24] focus:bg-white transition-all"
                >
                  <option value="">-- Choose Resort from Available Database --</option>
                  {unassignedResorts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.location})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-gray-400 font-bold mt-1.5">
                Shows resorts that do not have an active Resort Partner assigned yet.
              </p>
            </div>

            {/* 2. PARTNER NAME */}
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                2. Resort Partner Full Name
              </label>
              <input
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="e.g. Rajesh Sharma"
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 font-bold text-sm outline-none focus:border-[#6B0D24] focus:bg-white transition-all"
              />
            </div>

            {/* 3. MOBILE NUMBER & EMAIL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                  3. Partner Mobile Number
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-4 flex items-center font-bold text-gray-400 text-sm">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={partnerPhone}
                    onChange={(e) => setPartnerPhone(e.target.value)}
                    placeholder="9876543210"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 pl-14 font-bold text-sm outline-none focus:border-[#6B0D24] focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
                  4. Partner Work Email
                </label>
                <input
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  placeholder="rajesh@resortname.com"
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 font-bold text-sm outline-none focus:border-[#6B0D24] focus:bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || loadingResorts}
              className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-4 rounded-2xl transition shadow-lg text-xs uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <i className="ph-bold ph-spinner animate-spin text-base"></i> Assigning Partner...
                </>
              ) : (
                <>
                  <i className="ph-bold ph-check-circle text-base text-[#C5A059]"></i> Create Partner Account
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}