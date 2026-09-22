'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PartnerOverviewProps {
  resortId: string;
  resortData: any;
  partnerData: any;
}

export default function PartnerOverview({
  resortId,
  resortData,
  partnerData,
}: PartnerOverviewProps) {
  const [inquiryCount, setInquiryCount] = useState(0);
  const [shortlistCount, setShortlistCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!resortId && !resortData) return;

    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const possibleIds = new Set<string>();
        const cleanNamesSet = new Set<string>();

        // Fuzzy Name Normalizer
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

        if (resortData) {
          if (resortData.id) possibleIds.add(String(resortData.id));
          if (resortData._recordId) possibleIds.add(String(resortData._recordId));
          if (resortData.core_id) possibleIds.add(String(resortData.core_id));

          if (resortData._recordName) cleanNamesSet.add(normalizeResortName(resortData._recordName));
          if (resortData.core_name) cleanNamesSet.add(normalizeResortName(resortData.core_name));
          if (resortData.resortName) cleanNamesSet.add(normalizeResortName(resortData.resortName));
          if (resortData.name) cleanNamesSet.add(normalizeResortName(resortData.name));
        }

        // 1. Fetch Inquiries Count (Matches by ID or Fuzzy Resort Name)
        const inqSnap = await getDocs(collection(db, 'inquiries'));
        const matchedInquiryIds = new Set<string>();

        inqSnap.forEach((d) => {
          const data = d.data();
          const inqResortId = String(data.resortId || '');
          const inqRawName = String(data.resortName || '');
          const inqCleanName = normalizeResortName(inqRawName);

          const isIdMatch = possibleIds.has(inqResortId);

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
            matchedInquiryIds.add(d.id);
          }
        });

        setInquiryCount(matchedInquiryIds.size);

        // 2. Fetch Shortlisted/Saved Budgets Count
        const budgetSnap = await getDocs(collection(db, 'saved_budgets'));
        let matchedBudgetCount = 0;

        budgetSnap.forEach((d) => {
          const data = d.data();
          const bResortId = String(data.resortId || '');
          if (possibleIds.has(bResortId)) {
            matchedBudgetCount++;
          }
        });

        setShortlistCount(matchedBudgetCount);
      } catch (err) {
        console.error('Error fetching resort stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [resortId, resortData]);

  const roomCount = Number(resortData?.core_rooms || resortData?.rooms || 0);
  const maxCap = roomCount > 0 ? roomCount * 3 : 300;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] block mb-0.5">
            Partner Control Panel
          </span>
          <h2 className="text-xl md:text-2xl font-black text-gray-900">
            {partnerData?.resortName || 'Resort Overview'}
          </h2>
        </div>

        <Link
          href={`/resort/${resortId}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 bg-[#FAF6F0] hover:bg-[#6B0D24] hover:text-white border border-[#6B0D24]/20 text-[#6B0D24] font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition shadow-2xs self-start sm:self-auto"
        >
          <span>Live Page Preview</span>
          <i className="ph-bold ph-arrow-up-right text-sm"></i>
        </Link>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-1">
          <div className="flex justify-between items-center text-gray-400">
            <span className="text-[10px] font-black uppercase tracking-widest">Total Inquiries</span>
            <i className="ph-fill ph-envelope-simple text-xl text-[#6B0D24]"></i>
          </div>
          <p className="text-3xl font-black text-gray-900">
            {loadingStats ? '...' : inquiryCount}
          </p>
          <span className="text-[10px] font-bold text-green-600 block">Direct Customer Leads</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-1">
          <div className="flex justify-between items-center text-gray-400">
            <span className="text-[10px] font-black uppercase tracking-widest">Shortlisted</span>
            <i className="ph-fill ph-bookmark-simple text-xl text-[#C5A059]"></i>
          </div>
          <p className="text-3xl font-black text-gray-900">
            {loadingStats ? '...' : shortlistCount}
          </p>
          <span className="text-[10px] font-bold text-gray-500 block">Users Saved Your Quote</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-1">
          <div className="flex justify-between items-center text-gray-400">
            <span className="text-[10px] font-black uppercase tracking-widest">Room Inventory</span>
            <i className="ph-fill ph-door text-xl text-[#6B0D24]"></i>
          </div>
          <p className="text-3xl font-black text-gray-900">{roomCount}</p>
          <span className="text-[10px] font-bold text-gray-500 block">Max Cap: ~{maxCap} Guests</span>
        </div>
      </div>

      {/* PROPERTY SPECS SUMMARY */}
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#6B0D24] flex items-center gap-1.5">
          <i className="ph-bold ph-sliders"></i> Property Attributes
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-white p-3.5 rounded-xl border border-gray-200">
            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Location</span>
            <span className="font-black text-gray-900">{resortData?.core_location || 'India'}</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-gray-200">
            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Star Rating</span>
            <span className="font-black text-[#C5A059]">{resortData?.core_star_rating || '4 Star'}</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-gray-200">
            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Vibe / Category</span>
            <span className="font-black text-gray-900">{resortData?.core_feature || 'Luxury Property'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}