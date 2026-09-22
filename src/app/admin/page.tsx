'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminPartnerNavbar from '@/components/layout/AdminPartnerNavbar';
import DataEntryModule from '@/components/admin/DataEntryModule';
import PlannerAssignmentModule from '@/components/admin/PlannerAssignmentModule';
import Tour360UploaderModule from '@/components/admin/Tour360UploaderModule';
import MasterCatalogModule from '@/components/admin/MasterCatalogModule';
import ResortSchemaBuilderModule from '@/components/admin/ResortSchemaBuilderModule';
import PlannerProfileSchemaModule from '@/components/admin/PlannerProfileSchemaModule';
import SortingManagerModule from '@/components/admin/SortingManagerModule';
import Top10CollectionsModule from '@/components/admin/Top10CollectionsModule';
import BlogManagerModule from '@/components/admin/BlogManagerModule';
import ImageUrlGeneratorModule from '@/components/admin/ImageUrlGeneratorModule';
import ActivityMonitorModule from '@/components/admin/ActivityMonitorModule';
import PartnerSupportTicketModule from '@/components/partner/PartnerSupportTicketModule';
import ResortQuotationBuilderModule from '@/components/admin/ResortQuotationBuilderModule';
import SuperAdminCrmModule from '@/components/admin/SuperAdminCrmModule';

interface ResortOption {
  id: string;
  name: string;
  location: string;
  hasPartner?: boolean;
  partnerName?: string;
  rooms?: number;
  core_hidden?: boolean;
}

interface PartnerAccount {
  id: string;
  partnerName: string;
  phone: string;
  email: string;
  resortId: string;
  resortName: string;
  status: 'pending_password' | 'active';
  createdAt: string;
}

interface ApprovalRequest {
  id: string;
  resortId: string;
  resortName: string;
  partnerId: string;
  partnerName: string;
  type: string;
  proposedTiers?: { min: number; max: number; price: number }[];
  proposedImages?: string[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  rejectionReason?: string;
}

export default function SuperAdminCommandCenter() {
  const [activeTab, setActiveTab] = useState<string>('partners');
  const [loading, setLoading] = useState(true);

  // Core Datasets
  const [allResorts, setAllResorts] = useState<ResortOption[]>([]);
  const [allPartners, setAllPartners] = useState<PartnerAccount[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Create Partner Form State
  const [selectedResortId, setSelectedResortId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerMsg, setPartnerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit Partner Modal State
  const [editingPartner, setEditingPartner] = useState<PartnerAccount | null>(null);

  // Search Filter State for Resorts
  const [resortSearch, setResortSearch] = useState('');

  // Fetch all datasets from Firestore
  const fetchAllAdminData = async () => {
    setLoading(true);
    try {
      const [resortSnap, partnerSnap, requestSnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'resort_data')),
        getDocs(collection(db, 'resort_partners')),
        getDocs(collection(db, 'partner_approval_requests')),
        getDocs(collection(db, 'activity_logs')),
      ]);

      // 1. Process Resorts
      const resList: ResortOption[] = [];
      resortSnap.forEach((d) => {
        const data = d.data();
        resList.push({
          id: d.id,
          name: data._recordName || data.core_name || 'Unnamed Resort',
          location: data.core_location || 'India',
          hasPartner: !!data.hasPartner,
          partnerName: data.partnerName || undefined,
          rooms: Number(data.core_rooms || data.rooms || 0),
          core_hidden: !!data.core_hidden,
        });
      });
      resList.sort((a, b) => a.name.localeCompare(b.name));
      setAllResorts(resList);

      // 2. Process Partners
      const partList: PartnerAccount[] = [];
      partnerSnap.forEach((d) => partList.push(d.data() as PartnerAccount));
      partList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllPartners(partList);

      // 3. Process Approval Requests
      const reqList: ApprovalRequest[] = [];
      requestSnap.forEach((d) => reqList.push(d.data() as ApprovalRequest));
      reqList.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setApprovalRequests(reqList);

      // 4. Process Activity Logs
      const logsList: any[] = [];
      logSnap.forEach((d) => logsList.push({ id: d.id, ...d.data() }));
      logsList.sort((a, b) => new Date(b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp).getTime() - new Date(a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp).getTime());
      setActivityLogs(logsList.slice(0, 20));
    } catch (err) {
      console.error('Error fetching admin datasets:', err);
    } finally {
      setLoading(false);
    }
  };

   // Inside SuperAdminCommandCenter component in app/admin/page.tsx:

useEffect(() => {
  const handleOpenQuoteBuilderEvent = () => {
    setActiveTab('quotationbuilder');
  };

  window.addEventListener('open_quote_builder_for_lead', handleOpenQuoteBuilderEvent);
  return () => window.removeEventListener('open_quote_builder_for_lead', handleOpenQuoteBuilderEvent);
}, []);

  // REALTIME FIRESTORE LISTENER FOR APPROVAL QUEUE
  useEffect(() => {
    fetchAllAdminData();

    const unsubscribe = onSnapshot(
      collection(db, 'partner_approval_requests'),
      (snap) => {
        const reqList: ApprovalRequest[] = [];
        snap.forEach((d) => reqList.push(d.data() as ApprovalRequest));
        reqList.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        setApprovalRequests(reqList);
      },
      (error) => {
        console.error('Error listening to approval requests:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const unassignedResorts = useMemo(() => {
    return allResorts.filter((r) => !r.hasPartner && !r.core_hidden);
  }, [allResorts]);

  // --- ACTION 1: CREATE RESORT PARTNER ---
  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartnerMsg(null);

    if (!selectedResortId) {
      setPartnerMsg({ type: 'error', text: 'Please select an unassigned resort.' });
      return;
    }
    if (!partnerName.trim() || partnerPhone.length < 10 || !partnerEmail.trim()) {
      setPartnerMsg({ type: 'error', text: 'Please enter valid Partner Name, 10-digit Phone, and Email.' });
      return;
    }

    setSavingPartner(true);

    try {
      const targetResort = allResorts.find((r) => r.id === selectedResortId);
      const cleanPhone = partnerPhone.trim().replace(/[^0-9]/g, '');
      const partnerDocId = `partner_${cleanPhone}`;

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

      await updateDoc(doc(db, 'resort_data', selectedResortId), {
        hasPartner: true,
        partnerId: partnerDocId,
        partnerName: partnerName.trim(),
      });

      setPartnerMsg({
        type: 'success',
        text: `Created Resort Partner account for ${partnerName} linked to ${targetResort?.name}!`,
      });

      setSelectedResortId('');
      setPartnerName('');
      setPartnerPhone('');
      setPartnerEmail('');
      await fetchAllAdminData();
    } catch (err: any) {
      console.error('Error creating partner:', err);
      setPartnerMsg({ type: 'error', text: err.message || 'Failed to create partner account.' });
    } finally {
      setSavingPartner(false);
    }
  };

  // --- ACTION 2: DELETE RESORT PARTNER ---
  const handleDeletePartner = async (partner: PartnerAccount) => {
    if (!confirm(`Delete partner account for "${partner.partnerName}"? This will unassign ${partner.resortName}.`)) return;

    setLoading(true);

    try {
      await deleteDoc(doc(db, 'resort_partners', partner.id));

      if (partner.resortId) {
        await updateDoc(doc(db, 'resort_data', partner.resortId), {
          hasPartner: false,
          partnerId: null,
          partnerName: null,
        });
      }

      alert(`Successfully deleted partner account and freed ${partner.resortName} for reassignment.`);
      await fetchAllAdminData();
    } catch (err: any) {
      console.error('Error deleting partner:', err);
      alert('Failed to delete partner account.');
      setLoading(false);
    }
  };

  // --- ACTION 3: SAVE EDITED PARTNER DETAILS ---
  const handleSaveEditPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;

    setLoading(true);

    try {
      await updateDoc(doc(db, 'resort_partners', editingPartner.id), {
        partnerName: editingPartner.partnerName.trim(),
        email: editingPartner.email.trim().toLowerCase(),
        phone: editingPartner.phone.trim(),
      });

      alert('Partner details updated successfully!');
      setEditingPartner(null);
      await fetchAllAdminData();
    } catch (err: any) {
      console.error('Error updating partner:', err);
      alert('Failed to update partner details.');
      setLoading(false);
    }
  };

  // --- ACTION 4: APPROVE REQUEST ---
  const handleApproveRequest = async (req: ApprovalRequest) => {
    if (!confirm(`Approve and push updates live for ${req.resortName}?`)) return;

    setLoading(true);

    try {
      if (req.type === 'gallery_update') {
        const coverImg = req.proposedImages?.[0] || '';
        await updateDoc(doc(db, 'resort_data', req.resortId), {
          core_images: (req.proposedImages || []).join(','),
          image: coverImg,
          coverImage: coverImg,
          updatedAt: new Date().toISOString(),
        });
      } else if (req.proposedTiers && req.proposedTiers.length > 0) {
        const minPrice = Math.min(...req.proposedTiers.map((t) => t.price));
        const updatePayload: Record<string, any> = {
          core_pricing_tiers: req.proposedTiers,
          core_base_price: minPrice,
          id_base_price: minPrice,
          updatedAt: new Date().toISOString(),
        };

        req.proposedTiers.forEach((tier, idx) => {
          updatePayload[`calc_base_price_${idx}`] = tier.price;
          updatePayload[`id_calc_base_price_${idx}`] = tier.price;
          updatePayload[`cond_min_guest_${idx}`] = tier.min;
          updatePayload[`cond_max_guest_${idx}`] = tier.max;
        });

        await updateDoc(doc(db, 'resort_data', req.resortId), updatePayload);
      }

      await updateDoc(doc(db, 'partner_approval_requests', req.id), {
        status: 'approved',
        approvedAt: new Date().toISOString(),
      });

      alert(`✅ Successfully approved! Updates are now LIVE for ${req.resortName}.`);
      await fetchAllAdminData();
    } catch (err: any) {
      console.error('Approval Error:', err);
      alert('Failed to approve request.');
      setLoading(false);
    }
  };

  // --- ACTION 5: REJECT REQUEST ---
  const handleRejectRequest = async (req: ApprovalRequest) => {
    const reason = prompt(`Enter rejection reason for ${req.resortName}:`, 'Does not meet platform guidelines.');
    if (reason === null) return;

    setLoading(true);

    try {
      await updateDoc(doc(db, 'partner_approval_requests', req.id), {
        status: 'rejected',
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
      });

      alert(`Request rejected for ${req.resortName}.`);
      await fetchAllAdminData();
    } catch (err: any) {
      console.error('Rejection Error:', err);
      alert('Failed to reject request.');
      setLoading(false);
    }
  };

  // --- ACTION 6: UNASSIGN PARTNER FROM RESORT ---
  const handleUnassignResortPartner = async (resort: ResortOption) => {
    if (!confirm(`Unassign partner from ${resort.name}?`)) return;
    setLoading(true);

    try {
      await updateDoc(doc(db, 'resort_data', resort.id), {
        hasPartner: false,
        partnerId: null,
        partnerName: null,
      });

      alert(`Unassigned partner from ${resort.name}.`);
      await fetchAllAdminData();
    } catch (err: any) {
      alert('Failed to unassign partner.');
      setLoading(false);
    }
  };

  const filteredResortsList = useMemo(() => {
    if (!resortSearch.trim()) return allResorts;
    const q = resortSearch.toLowerCase();
    return allResorts.filter(
      (r) => r.name.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)
    );
  }, [allResorts, resortSearch]);

  const pendingApprovals = approvalRequests.filter((r) => r.status === 'pending');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col">
      {/* SUPER ADMIN NAVBAR */}
      <AdminPartnerNavbar portalType="admin" userName="Super Admin" />

      {/* DASHBOARD BODY */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 pt-24 md:pt-28 pb-16 flex flex-col md:flex-row gap-8 items-start">
        {/* REGROUPED SIDEBAR MODULE NAVIGATION */}
        <aside className="w-full md:w-64 shrink-0 space-y-6">
          {/* CATEGORY 1: PARTNER & RESORT MANAGEMENT */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] px-3 block mb-2">
              👑 Partner & Resort Management
            </span>

            <button
              onClick={() => setActiveTab('partners')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'partners'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className="ph-bold ph-users text-sm"></i>
                <span>Resort Partners</span>
              </div>
              <span className="bg-white/20 text-current text-[10px] px-2 py-0.5 rounded-md font-black">
                {allPartners.length}
              </span>
            </button>
            

            <button
  onClick={() => setActiveTab('crm')}
  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
    activeTab === 'crm'
      ? 'bg-[#6B0D24] text-white shadow-md'
      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
  }`}
>
  <div className="flex items-center gap-2">
    <i className="ph-bold ph-chart-line-up text-sm"></i>
    <span>Master Sales CRM</span>
  </div>
</button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'approvals'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className="ph-bold ph-hourglass text-sm"></i>
                <span>Approval Queue</span>
              </div>
              {pendingApprovals.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-md font-black animate-pulse">
                  {pendingApprovals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('resorts')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'resorts'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className="ph-bold ph-buildings text-sm"></i>
                <span>Resorts Inventory</span>
              </div>
              <span className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded-md font-black">
                {allResorts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('dataentry')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'dataentry'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-keyboard text-sm"></i>
              <span>Data Entry Module</span>
            </button>

            <button
              onClick={() => setActiveTab('plannerassign')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'plannerassign'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-user-switch text-sm"></i>
              <span>Planner Assignment</span>
            </button>

            <button
              onClick={() => setActiveTab('tour360')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'tour360'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-camera-rotate text-sm"></i>
              <span>360° View Uploader</span>
            </button>
          </div>

          {/* CATEGORY 2: DATA & SCHEMA TOOLS */}
          <div className="space-y-1.5 pt-2 border-t border-gray-200">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] px-3 block mb-2">
              🛠️ Data & Schema Tools
            </span>

            <button
              onClick={() => setActiveTab('mastercatalog')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'mastercatalog'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-database text-sm"></i>
              <span>Master Data Catalog</span>
            </button>

            <button
              onClick={() => setActiveTab('resortschema')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'resortschema'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-[#6B0D24] ph-gear text-sm"></i>
              <span>Resort Schema Builder</span>
            </button>

            <button
              onClick={() => setActiveTab('plannermaster')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'plannermaster'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-users text-sm"></i>
              <span>Planner Profile Schema</span>
            </button>

            <button
              onClick={() => setActiveTab('sorting')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'sorting'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-code-block text-sm"></i>
              <span>Sorting Manager</span>
            </button>
          </div>

          {/* CATEGORY 3: CONTENT & MARKETING */}
          <div className="space-y-1.5 pt-2 border-t border-gray-200">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] px-3 block mb-2">
              📸 Content & Marketing
            </span>

            <button
              onClick={() => setActiveTab('top10')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'top10'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-image-square text-sm"></i>
              <span>Top 10 Collections</span>
            </button>

            <button
              onClick={() => setActiveTab('blogs')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'blogs'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-article text-sm"></i>
              <span>Blog Manager</span>
            </button>

            <button
              onClick={() => setActiveTab('imageurl')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'imageurl'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-image text-sm"></i>
              <span>Image URL Gen</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                activeTab === 'logs'
                  ? 'bg-[#6B0D24] text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <i className="ph-bold ph-chart-line-up text-sm"></i>
              <span>Activity Monitor</span>
            </button>
<button
  onClick={() => setActiveTab('support')}
  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
    activeTab === 'support'
      ? 'bg-[#6B0D24] text-white shadow-md'
      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
  }`}
>
  <div className="flex items-center gap-2">
    <i className="ph-bold ph-headset text-sm"></i>
    <span>Helpdesk Support Tickets</span>
  </div>
</button>

          </div>
        </aside>

        {/* MAIN TAB CONTENT DISPLAY */}
        <main className="flex-1 w-full bg-white rounded-3xl p-6 md:p-8 border border-gray-200 shadow-xs">
          {loading ? (
            <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
              <i className="ph-bold ph-spinner animate-spin text-4xl mb-3 text-[#6B0D24] block mx-auto"></i>
              Fetching Command Center Data...
            </div>
          ) : (
            <>
              {/* ================= TAB 1: RESORT PARTNERS MANAGEMENT ================= */}
              {activeTab === 'partners' && (
                <div className="space-y-8">
                  <div className="border-b border-gray-100 pb-4">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900">
                      Resort Partners Management
                    </h2>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Create, edit, or delete partner accounts and assign them to resorts.
                    </p>
                  </div>

                  {/* PARTNER CREATION FORM */}
                  <div className="bg-stone-50 border border-stone-200 p-6 rounded-2xl space-y-6">
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#6B0D24] flex items-center gap-2">
                      <i className="ph-fill ph-user-plus text-base"></i> Create New Resort Partner
                    </h3>

                    {partnerMsg && (
                      <div
                        className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                          partnerMsg.type === 'success'
                            ? 'bg-green-50 border border-green-200 text-green-800'
                            : 'bg-red-50 border border-red-200 text-red-800'
                        }`}
                      >
                        <i className="ph-bold ph-info text-base"></i>
                        <span>{partnerMsg.text}</span>
                      </div>
                    )}

                    <form onSubmit={handleCreatePartner} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                            Unassigned Resort
                          </label>
                          <select
                            value={selectedResortId}
                            onChange={(e) => setSelectedResortId(e.target.value)}
                            required
                            className="w-full bg-white border border-gray-200 rounded-xl p-3 font-bold text-xs text-gray-900 outline-none focus:border-[#6B0D24]"
                          >
                            <option value="">-- Choose Unassigned Resort --</option>
                            {unassignedResorts.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.location})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                            Partner Name
                          </label>
                          <input
                            type="text"
                            value={partnerName}
                            onChange={(e) => setPartnerName(e.target.value)}
                            placeholder="Rajesh Sharma"
                            required
                            className="w-full bg-white border border-gray-200 rounded-xl p-3 font-bold text-xs text-gray-900 outline-none focus:border-[#6B0D24]"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                            Partner Mobile (+91)
                          </label>
                          <input
                            type="tel"
                            value={partnerPhone}
                            onChange={(e) => setPartnerPhone(e.target.value)}
                            placeholder="9876543210"
                            required
                            className="w-full bg-white border border-gray-200 rounded-xl p-3 font-bold text-xs text-gray-900 outline-none focus:border-[#6B0D24]"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                            Partner Email
                          </label>
                          <input
                            type="email"
                            value={partnerEmail}
                            onChange={(e) => setPartnerEmail(e.target.value)}
                            placeholder="rajesh@resort.com"
                            required
                            className="w-full bg-white border border-gray-200 rounded-xl p-3 font-bold text-xs text-gray-900 outline-none focus:border-[#6B0D24]"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={savingPartner}
                        className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {savingPartner ? 'Creating...' : '+ Create Partner Account'}
                      </button>
                    </form>
                  </div>

                  {/* ALL PARTNERS TABLE */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
                      All Registered Partners ({allPartners.length})
                    </h3>

                    {allPartners.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No resort partners created yet.</p>
                    ) : (
                      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="p-3.5">Partner Name</th>
                              <th className="p-3.5">Assigned Resort</th>
                              <th className="p-3.5">Contact Details</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                            {allPartners.map((p) => (
                              <tr key={p.id} className="hover:bg-stone-50/50 transition">
                                <td className="p-3.5 font-bold text-gray-900">{p.partnerName}</td>
                                <td className="p-3.5 text-[#6B0D24] font-bold">{p.resortName}</td>
                                <td className="p-3.5">
                                  <p>{p.email}</p>
                                  <p className="text-gray-400 font-mono text-[11px]">+91 {p.phone}</p>
                                </td>
                                <td className="p-3.5">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                      p.status === 'active'
                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {p.status === 'active' ? 'Active' : 'Pending First Login'}
                                  </span>
                                </td>
                                <td className="p-3.5 text-right space-x-2">
                                  <button
                                    onClick={() => setEditingPartner(p)}
                                    className="text-gray-500 hover:text-black font-bold p-1"
                                    title="Edit Partner"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeletePartner(p)}
                                    className="text-red-500 hover:text-red-700 font-bold p-1"
                                    title="Delete Partner"
                                  >
                                    🗑️ Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ================= TAB 2: APPROVAL QUEUE ================= */}
              {activeTab === 'approvals' && (
                <div className="space-y-6">
                  <div className="border-b border-gray-100 pb-4">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900">
                      Partner Approval Queue ({pendingApprovals.length} Pending)
                    </h2>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Review pricing tier and gallery photo changes submitted by Resort Partners and approve to push live.
                    </p>
                  </div>

                  {approvalRequests.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No approval requests submitted yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {approvalRequests.map((req) => (
                        <div
                          key={req.id}
                          className="bg-stone-50 border border-stone-200/80 rounded-2xl p-5 space-y-4"
                        >
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-stone-200 pb-3">
                            <div>
                              <span
                                className={`text-[9px] font-black uppercase px-2 py-0.5 rounded inline-block mb-1 ${
                                  req.status === 'pending'
                                    ? 'bg-amber-100 text-amber-900'
                                    : req.status === 'approved'
                                    ? 'bg-green-100 text-green-900'
                                    : 'bg-red-100 text-red-900'
                                }`}
                              >
                                {req.type === 'gallery_update' ? 'Gallery Photo Update' : 'Pricing Tier Update'} &bull; {req.status}
                              </span>
                              <h3 className="text-base font-black text-gray-900">{req.resortName}</h3>
                              <p className="text-xs text-gray-500 font-medium">
                                Submitted by: <strong>{req.partnerName}</strong> &bull;{' '}
                                {new Date(req.submittedAt).toLocaleString()}
                              </p>
                            </div>

                            {req.status === 'pending' && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproveRequest(req)}
                                  className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-xs"
                                >
                                  ✓ Approve & Push Live
                                </button>
                                <button
                                  onClick={() => handleRejectRequest(req)}
                                  className="bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold px-3 py-2.5 rounded-xl text-xs transition cursor-pointer"
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            )}
                          </div>

                          {/* PREVIEW MATRIX BASED ON REQUEST TYPE */}
                          {req.type === 'gallery_update' ? (
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#6B0D24] mb-3">
                                Proposed Gallery Photos ({req.proposedImages?.length || 0} Images)
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                {(req.proposedImages || []).map((imgUrl, imgIdx) => (
                                  <div key={imgIdx} className="h-24 bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative">
                                    <img src={imgUrl} alt={`Photo ${imgIdx + 1}`} className="w-full h-full object-cover" />
                                    {imgIdx === 0 && (
                                      <span className="absolute top-1 left-1 bg-[#6B0D24] text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                                        Cover
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#6B0D24] mb-3">
                                Proposed New Pricing Tiers Matrix
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {(req.proposedTiers || []).map((t, idx) => (
                                  <div key={idx} className="bg-white border border-gray-200 p-3.5 rounded-xl space-y-1">
                                    <span className="text-[9px] font-black text-[#C5A059] uppercase block">
                                      Tier #{idx + 1}
                                    </span>
                                    <p className="font-bold text-gray-700 text-xs">
                                      {t.min} – {t.max >= 99999 ? 'Max' : t.max} Guests
                                    </p>
                                    <p className="font-black text-[#6B0D24] text-base">
                                      ₹{t.price.toLocaleString('en-IN')}{' '}
                                      <span className="text-[10px] text-gray-400 font-medium">/person/night</span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ================= TAB 3: RESORTS INVENTORY ================= */}
              {activeTab === 'resorts' && (
                <div className="space-y-6">
                  <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-black text-gray-900">
                        Resorts Inventory ({allResorts.length})
                      </h2>
                      <p className="text-xs text-gray-500 font-medium mt-1">
                        View all resorts in database, partner assignment status, and room specs.
                      </p>
                    </div>

                    <input
                      type="text"
                      value={resortSearch}
                      onChange={(e) => setResortSearch(e.target.value)}
                      placeholder="Search resort or location..."
                      className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-[#6B0D24] w-full sm:w-64"
                    />
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3.5">Resort Name</th>
                          <th className="p-3.5">Location</th>
                          <th className="p-3.5">Rooms</th>
                          <th className="p-3.5">Assigned Partner</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                        {filteredResortsList.map((r) => (
                          <tr key={r.id} className="hover:bg-stone-50/50 transition">
                            <td className="p-3.5 font-bold text-gray-900">{r.name}</td>
                            <td className="p-3.5">{r.location}</td>
                            <td className="p-3.5 font-bold">{r.rooms || '--'} Rooms</td>
                            <td className="p-3.5">
                              {r.hasPartner ? (
                                <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {r.partnerName || 'Assigned'}
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right space-x-2">
                              <Link
                                href={`/resort/${r.id}`}
                                target="_blank"
                                className="text-[#6B0D24] font-bold hover:underline"
                              >
                                View Page ↗
                              </Link>
                              {r.hasPartner && (
                                <button
                                  onClick={() => handleUnassignResortPartner(r)}
                                  className="text-amber-600 font-bold hover:underline ml-2"
                                >
                                  Unassign
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ================= COMPONENT PLACEHOLDER SLOTS FOR LEGACY TOOLS ================= */}
              {activeTab === 'mastercatalog' && <MasterCatalogModule />}

              {activeTab === 'resortschema' && <ResortSchemaBuilderModule />}

              {activeTab === 'plannermaster' && <PlannerProfileSchemaModule />}

              {activeTab === 'plannerassign' && <PlannerAssignmentModule />}

              {activeTab === 'dataentry' && <DataEntryModule />}

              {activeTab === 'sorting' && <SortingManagerModule />}

              {activeTab === 'top10' && <Top10CollectionsModule />}

              {activeTab === 'blogs' && <BlogManagerModule />}

              {activeTab === 'tour360' && <Tour360UploaderModule />}

              {activeTab === 'imageurl' && <ImageUrlGeneratorModule />}
              {activeTab === 'crm' && (
  <SuperAdminCrmModule
    onNavigateToQuoteBuilder={() => setActiveTab('quotationbuilder')}
  />
)}

              {activeTab === 'logs' && <ActivityMonitorModule />}
              {activeTab === 'support' && (
  <PartnerSupportTicketModule isSuperAdmin={true} />
)}
{activeTab === 'quotationbuilder' && <ResortQuotationBuilderModule />}
            </>
          )}
        </main>
      </div>

      {/* EDIT PARTNER MODAL */}
      {editingPartner && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 relative">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-base">Edit Partner: {editingPartner.partnerName}</h3>
              <button onClick={() => setEditingPartner(null)} className="text-gray-400 font-bold text-xs">
                ✖ Close
              </button>
            </div>

            <form onSubmit={handleSaveEditPartner} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Partner Name</label>
                <input
                  type="text"
                  value={editingPartner.partnerName}
                  onChange={(e) => setEditingPartner({ ...editingPartner, partnerName: e.target.value })}
                  required
                  className="w-full bg-gray-50 border rounded-xl p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Partner Email</label>
                <input
                  type="email"
                  value={editingPartner.email}
                  onChange={(e) => setEditingPartner({ ...editingPartner, email: e.target.value })}
                  required
                  className="w-full bg-gray-50 border rounded-xl p-2.5 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase">Partner Mobile</label>
                <input
                  type="tel"
                  value={editingPartner.phone}
                  onChange={(e) => setEditingPartner({ ...editingPartner, phone: e.target.value })}
                  required
                  className="w-full bg-gray-50 border rounded-xl p-2.5 text-xs font-bold"
                />
              </div>

              <button type="submit" className="w-full bg-[#6B0D24] text-white font-bold py-3 rounded-xl text-xs uppercase mt-2">
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}