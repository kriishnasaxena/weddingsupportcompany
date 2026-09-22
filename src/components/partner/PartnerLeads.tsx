'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PartnerLeadsProps {
  resortId: string;
  resortData?: any;
}

export default function PartnerLeads({ resortId, resortData: initialResortData }: PartnerLeadsProps) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resortId && !initialResortData) return;

    const fetchAllLeadsForResort = async () => {
      setLoading(true);
      try {
        const possibleIds = new Set<string>();
        const cleanNamesSet = new Set<string>();

        // Fuzzy Name Normalizer (Handles "Gateway" vs "Gateways", "Resort" vs "Resorts")
        const normalizeResortName = (str: string) => {
          if (!str) return '';
          return str
            .toLowerCase()
            .replace(/resorts?/g, '')
            .replace(/s\b/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
        };

        if (resortId) possibleIds.add(String(resortId));

        // 1. Fetch live resort_data doc to extract ALL internal IDs and Names
        let rd = initialResortData;
        if (!rd) {
          try {
            const resSnap = await getDoc(doc(db, 'resort_data', resortId));
            if (resSnap.exists()) rd = resSnap.data();
          } catch (e) {}
        }

        if (rd) {
          if (rd.id) possibleIds.add(String(rd.id));
          if (rd._recordId) possibleIds.add(String(rd._recordId));
          if (rd.core_id) possibleIds.add(String(rd.core_id));

          if (rd._recordName) cleanNamesSet.add(normalizeResortName(rd._recordName));
          if (rd.core_name) cleanNamesSet.add(normalizeResortName(rd.core_name));
          if (rd.resortName) cleanNamesSet.add(normalizeResortName(rd.resortName));
          if (rd.name) cleanNamesSet.add(normalizeResortName(rd.name));
        }

        // 2. Fetch all inquiries and match
        const snap = await getDocs(collection(db, 'inquiries'));
        const matchedList: any[] = [];

        snap.forEach((d) => {
          const data = d.data();
          const inqResortId = String(data.resortId || '');
          const inqRawName = String(data.resortName || '');
          const inqCleanName = normalizeResortName(inqRawName);

          // Match by ID
          const isIdMatch = possibleIds.has(inqResortId);

          // Match by Fuzzy Name
          let isNameMatch = false;
          if (inqCleanName) {
            for (const targetName of Array.from(cleanNamesSet)) {
              if (
                targetName &&
                targetName.length > 3 &&
                (inqCleanName.includes(targetName) || targetName.includes(inqCleanName))
              ) {
                isNameMatch = true;
                break;
              }
            }
          }

          if (isIdMatch || isNameMatch) {
            matchedList.push({ docId: d.id, ...data });
          }
        });

        // 3. Sort newest first by submittedAt, timestamp, or createdAt
        matchedList.sort((a, b) => {
          const tA = a.submittedAt
            ? new Date(a.submittedAt).getTime()
            : a.timestamp
            ? new Date(a.timestamp).getTime()
            : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;
          const tB = b.submittedAt
            ? new Date(b.submittedAt).getTime()
            : b.timestamp
            ? new Date(b.timestamp).getTime()
            : b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;
          return tB - tA;
        });

        setLeads(matchedList);
      } catch (err) {
        console.error('Error fetching leads:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllLeadsForResort();
  }, [resortId, initialResortData]);

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
        <i className="ph-bold ph-spinner animate-spin text-2xl mb-2 text-[#6B0D24] block mx-auto"></i>
        Fetching All Customer Leads for Your Property...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4">
        <h2 className="text-xl md:text-2xl font-black text-gray-900">
          Inquiries & Customer Leads ({leads.length})
        </h2>
        <p className="text-xs text-gray-500 font-medium mt-1">
          Direct wedding inquiries submitted by couples interested in your property.
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="p-10 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-gray-400 text-xs font-bold uppercase tracking-wider">
          📞 No direct inquiries received for this resort yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leads.map((lead, idx) => {
            // Flexible field extraction for all database dump schema variations
            const customerName =
              lead.customerName || lead.userName || lead.name || 'Interested Customer';
            const rawPhone =
              lead.customerPhone || lead.phone || lead.phoneNumber || lead.mobile || '';
            const cleanPhone = String(rawPhone).replace(/[^0-9]/g, '');

            const status = lead.status || 'New';

            // Handles weddingDates (plural) vs weddingDate (singular) vs date vs checkInDate
            const weddingDates =
              lead.weddingDates ||
              lead.weddingDate ||
              lead.checkInDate ||
              lead.date ||
              '';

            const submittedAtStr = lead.submittedAt || lead.timestamp || lead.createdAt;

            const formattedSubmittedDate = submittedAtStr
              ? new Date(submittedAtStr).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Recent Inquiry';

            const guestCount = lead.guests || lead.guestCount || null;

            return (
              <div
                key={lead.docId || lead.id || `lead_card_${idx}`}
                className="bg-white border border-gray-200 p-5 rounded-2xl space-y-3.5 shadow-2xs hover:border-[#6B0D24]/30 transition"
              >
                <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-green-50 text-green-700 border border-green-200 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                        {status}
                      </span>
                      <h3 className="font-black text-gray-900 text-base leading-tight">
                        {customerName}
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 block">
                      Submitted on {formattedSubmittedDate}
                    </span>
                  </div>

                  {guestCount && (
                    <span className="bg-[#FAF6F0] text-[#6B0D24] border border-[#6B0D24]/10 text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0">
                      {guestCount} Guests
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs text-gray-700 font-medium">
                  {cleanPhone ? (
                    <p className="flex items-center gap-2">
                      <i className="ph-fill ph-phone text-[#6B0D24] text-sm"></i>
                      <a
                        href={`tel:+91${cleanPhone.slice(-10)}`}
                        className="font-bold text-gray-900 hover:underline"
                      >
                        +91 {cleanPhone.slice(-10)}
                      </a>
                    </p>
                  ) : (
                    <p className="text-gray-400 italic">No phone number provided</p>
                  )}

                  {weddingDates && (
                    <p className="flex items-center gap-2 text-gray-600">
                      <i className="ph-fill ph-calendar text-[#C5A059] text-sm"></i>
                      <span>
                        Dates: <strong>{weddingDates}</strong>
                      </span>
                    </p>
                  )}

                  {lead.campaignTitle && (
                    <p className="text-[11px] font-bold text-[#6B0D24] bg-[#FAF6F0] p-1.5 rounded-lg border border-[#6B0D24]/10">
                      Offer: {lead.campaignTitle}
                    </p>
                  )}

                  {lead.notes && (
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/80 mt-2">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">
                        Customer Notes
                      </span>
                      <p className="text-xs text-gray-700 font-medium leading-relaxed italic">
                        "{lead.notes}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}