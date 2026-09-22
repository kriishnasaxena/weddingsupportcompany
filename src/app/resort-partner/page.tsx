'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import AdminPartnerNavbar from '@/components/layout/AdminPartnerNavbar';
import PartnerOverview from '@/components/partner/PartnerOverview';
import PartnerPricingTiers from '@/components/partner/PartnerPricingTiers';
import PartnerCalendarDiscounts from '@/components/partner/PartnerCalendarDiscounts';
import PartnerGallery from '@/components/partner/PartnerGallery';
import ResortQuotationBuilderModule from '@/components/admin/ResortQuotationBuilderModule';
import PartnerSupportTicketModule from '@/components/partner/PartnerSupportTicketModule';
import ResortLeadCrmModule from '@/components/crm/ResortLeadCrmModule';

interface PartnerProfile {
  uid: string;
  partnerName: string;
  email: string;
  phone: string;
  resortId: string;
  resortName: string;
  role: string;
}

export default function ResortPartnerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [partnerData, setPartnerData] = useState<PartnerProfile | null>(null);
  const [resortData, setResortData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'pricing' | 'calendar' | 'gallery' | 'leads' | 'quotation' | 'support'
  >('overview');

  // Fetch Resort Data
  const fetchResortDetails = async (resortId: string) => {
    try {
      const resSnap = await getDoc(doc(db, 'resort_data', resortId));
      if (resSnap.exists()) {
        setResortData(resSnap.data());
      }
    } catch (e) {
      console.error('Error fetching resort details:', e);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wsc_resort_partner');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setPartnerData(parsed);
          if (parsed.resortId) fetchResortDetails(parsed.resortId);
        } catch (e) {}
      } else {
        router.push('/resort-partner/login');
      }
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
  const handleOpenLeadCrmEvent = () => {
    setActiveTab('leads');
  };

  const handleOpenQuoteForLeadEvent = () => {
    setActiveTab('quotation');
  };

  window.addEventListener('open_crm_lead', handleOpenLeadCrmEvent);
  window.addEventListener('open_quote_builder_for_lead', handleOpenQuoteForLeadEvent);

  return () => {
    window.removeEventListener('open_crm_lead', handleOpenLeadCrmEvent);
    window.removeEventListener('open_quote_builder_for_lead', handleOpenQuoteForLeadEvent);
  };
}, []);

  // LISTEN TO NAVBAR NOTIFICATION CLICK EVENT TO AUTOMATICALLY SWITCH TAB TO SUPPORT
  useEffect(() => {
    const handleOpenTicketTab = () => {
      setActiveTab('support');
    };

    window.addEventListener('open_support_ticket', handleOpenTicketTab);
    return () => window.removeEventListener('open_support_ticket', handleOpenTicketTab);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('wsc_resort_partner');
    router.push('/resort-partner/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center font-sans">
        <i className="ph-bold ph-spinner animate-spin text-5xl mb-4 text-[#6B0D24]"></i>
        <p className="font-bold text-gray-500 text-xs uppercase tracking-widest">
          Loading Partner Dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      {/* SEPARATE PARTNER NAVBAR */}
      <AdminPartnerNavbar
        portalType="partner"
        resortId={partnerData?.resortId}
        resortName={partnerData?.resortName}
        userName={partnerData?.partnerName}
        onLogout={handleLogout}
      />

      {/* DASHBOARD BODY */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 pt-24 md:pt-28 pb-12 space-y-6">
        {/* TOP HORIZONTAL NAVIGATION TABS */}
        <nav className="bg-white border border-gray-200 rounded-2xl p-2 shadow-xs flex items-center gap-2 overflow-x-auto whitespace-nowrap shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-chart-pie-slice text-base"></i>
            <span>Overview &amp; Stats</span>
          </button>

          <button
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'pricing'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-currency-inr text-base"></i>
            <span>Base Pricing</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-calendar-check text-base"></i>
            <span>Calendar Discounts</span>
          </button>

          <button
            onClick={() => setActiveTab('quotation')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'quotation'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-calculator text-base"></i>
            <span>Quotation Builder</span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'gallery'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-image text-base"></i>
            <span>Gallery &amp; Images</span>
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'leads'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-envelope-simple text-base"></i>
            <span>Inquiries &amp; Leads</span>
          </button>

          <button
            onClick={() => setActiveTab('support')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition shrink-0 cursor-pointer ${
              activeTab === 'support'
                ? 'bg-[#6B0D24] text-white shadow-sm'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-black border border-gray-100'
            }`}
          >
            <i className="ph-bold ph-headset text-base"></i>
            <span>Support &amp; Helpdesk</span>
          </button>
        </nav>

        {/* MAIN TAB CONTENT */}
        <div className="w-full bg-white rounded-3xl p-6 md:p-8 border border-gray-200 shadow-xs">
          {activeTab === 'overview' && (
            <PartnerOverview
              resortId={partnerData?.resortId || ''}
              resortData={resortData}
              partnerData={partnerData}
            />
          )}

          {activeTab === 'pricing' && (
            <PartnerPricingTiers
              resortId={partnerData?.resortId || ''}
              resortData={resortData}
              onUpdateSuccess={() => fetchResortDetails(partnerData?.resortId || '')}
            />
          )}

          {activeTab === 'calendar' && (
            <PartnerCalendarDiscounts
              resortId={partnerData?.resortId || ''}
              resortData={resortData}
              onUpdateSuccess={() => fetchResortDetails(partnerData?.resortId || '')}
            />
          )}

          {activeTab === 'quotation' && partnerData?.resortId && (
            <ResortQuotationBuilderModule resortId={partnerData.resortId} />
          )}

          {activeTab === 'gallery' && (
            <PartnerGallery
              resortId={partnerData?.resortId || ''}
              resortData={resortData}
              partnerData={partnerData}
              onUpdateSuccess={() => fetchResortDetails(partnerData?.resortId || '')}
            />
          )}

          {activeTab === 'leads' && partnerData?.resortId && (
  <ResortLeadCrmModule
    resortId={partnerData.resortId}
    partnerData={partnerData}
    resortData={resortData}
    onNavigateToQuoteBuilder={() => setActiveTab('quotation')}
  />
)}

          {activeTab === 'support' && partnerData?.resortId && (
            <PartnerSupportTicketModule
              resortId={partnerData.resortId}
              partnerData={partnerData}
              resortData={resortData}
            />
          )}
        </div>
      </main>
    </div>
  );
}