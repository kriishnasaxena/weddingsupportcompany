'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ResortLeadCrmModuleProps {
  resortId?: string;
  partnerData?: any;
  resortData?: any;
  isSuperAdmin?: boolean;
  onNavigateToQuoteBuilder?: (leadData: any) => void;
}

export interface CrmLead {
  id: string;
  resortId: string;
  resortName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  checkInDate?: string;
  checkOutDate?: string;
  weddingDates?: string;
  paxCount: number;
  stage: 'New' | 'Contacted' | 'Quote Sent' | 'Negotiation' | 'Won' | 'Lost';
  source?: string;
  notes?: { id: string; note: string; createdAt: string }[];
  offerQuoteId?: string;
  offerGrandTotal?: number;
  submittedAt: string;
  updatedAt: string;
}

const PIPELINE_STAGES: CrmLead['stage'][] = ['New', 'Contacted', 'Quote Sent', 'Negotiation', 'Won', 'Lost'];

const formatCurrency = (num: number) => (num ? num.toLocaleString('en-IN') : '0');

export default function ResortLeadCrmModule({
  resortId: partnerResortId,
  partnerData,
  resortData,
  isSuperAdmin = false,
  onNavigateToQuoteBuilder,
}: ResortLeadCrmModuleProps) {
  // View Modes: 'kanban' | 'table'
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Leads Dataset
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');

  // Selected Lead Drawer State
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // --- FETCH ALL LEADS FOR CRM ---
  const fetchCrmLeads = async () => {
    try {
      const list: CrmLead[] = [];
      const snap = await getDocs(collection(db, 'inquiries'));

      snap.forEach((d) => {
        const data = d.data();
        const inqResortId = data.resortId || data.resort_id || '';

        // Filter by resortId if partner mode
        if (isSuperAdmin || inqResortId === partnerResortId || String(inqResortId) === String(partnerResortId)) {
          const custName = data.customerName || data.userName || data.name || 'Interested Lead';
          const custPhone = data.customerPhone || data.userPhone || data.phone || '';
          const pax = data.guests || data.pax || data.guestCount || 200;

          let inDate = data.checkInDate || '';
          let outDate = data.checkOutDate || '';
          if (data.weddingDates && data.weddingDates.includes(' to ')) {
            const parts = data.weddingDates.split(' to ');
            inDate = parts[0].trim();
            outDate = parts[1].trim();
          } else if (data.weddingDate) {
            inDate = data.weddingDate.trim();
          }

          // STRICT STAGE PARSING: RESPECTS MANUALLY SET STAGE IN FIRESTORE
          let stageVal: CrmLead['stage'] = 'New';

          if (data.stage && PIPELINE_STAGES.includes(data.stage)) {
            stageVal = data.stage as CrmLead['stage'];
          } else if (data.offerSent || data.status === 'Offer Sent') {
            stageVal = 'Quote Sent';
          } else if (data.status === 'Offer Accepted' || data.status === 'Won') {
            stageVal = 'Won';
          } else if (data.status && PIPELINE_STAGES.includes(data.status as any)) {
            stageVal = data.status as CrmLead['stage'];
          }

          list.push({
            id: d.id,
            resortId: inqResortId,
            resortName: data.resortName || resortData?._recordName || 'Resort',
            customerName: custName,
            customerPhone: custPhone,
            customerEmail: data.email || '',
            checkInDate: inDate,
            checkOutDate: outDate,
            weddingDates: data.weddingDates || inDate,
            paxCount: typeof pax === 'number' ? pax : parseInt(String(pax)) || 200,
            stage: stageVal,
            source: data.source || 'Direct Inquiry',
            notes: data.notes || [],
            offerQuoteId: data.offerQuoteId || '',
            offerGrandTotal: data.offerGrandTotal || 0,
            submittedAt: data.submittedAt || data.timestamp || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });

      list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setLeads(list);

      // Check if target lead needs to be auto-opened from navbar notification
      const targetLeadId = localStorage.getItem('wsc_target_open_lead_id');
      if (targetLeadId) {
        const target = list.find((l) => l.id === targetLeadId);
        if (target) {
          handleOpenLeadDrawer(target);
          localStorage.removeItem('wsc_target_open_lead_id');
        }
      } else if (selectedLead) {
        const updated = list.find((l) => l.id === selectedLead.id);
        if (updated) setSelectedLead(updated);
      }
    } catch (err) {
      console.error('Error fetching CRM leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrmLeads();

    const intervalId = setInterval(() => {
      fetchCrmLeads();
    }, 5000); // 5 Seconds Real-time Sync

    return () => clearInterval(intervalId);
  }, [partnerResortId, isSuperAdmin]);

  // LISTEN TO NAVBAR NOTIFICATION CLICK EVENT
  useEffect(() => {
    const handleOpenLeadEvent = (event: any) => {
      const targetLeadId = event.detail?.leadId || localStorage.getItem('wsc_target_open_lead_id');
      if (targetLeadId) {
        const target = leads.find((l) => l.id === targetLeadId);
        if (target) {
          handleOpenLeadDrawer(target);
          localStorage.removeItem('wsc_target_open_lead_id');
        } else {
          getDoc(doc(db, 'inquiries', targetLeadId)).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              handleOpenLeadDrawer({ id: snap.id, ...data } as any);
              localStorage.removeItem('wsc_target_open_lead_id');
            }
          });
        }
      }
    };

    window.addEventListener('open_crm_lead', handleOpenLeadEvent);
    return () => window.removeEventListener('open_crm_lead', handleOpenLeadEvent);
  }, [leads]);

  // Lead Analytics & Growth Metrics
  const crmAnalytics = useMemo(() => {
    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => l.stage === 'New').length;
    const quotesSent = leads.filter((l) => l.stage === 'Quote Sent' || l.stage === 'Negotiation').length;
    const wonBookings = leads.filter((l) => l.stage === 'Won');
    const wonCount = wonBookings.length;

    const wonValue = wonBookings.reduce((sum, l) => sum + (l.offerGrandTotal || 0), 0);
    const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

    return {
      totalLeads,
      newLeads,
      quotesSent,
      wonCount,
      wonValue,
      conversionRate,
    };
  }, [leads]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch =
        !searchQuery.trim() ||
        l.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.customerPhone.includes(searchQuery) ||
        l.resortName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStage = stageFilter === 'ALL' || l.stage === stageFilter;

      return matchesSearch && matchesStage;
    });
  }, [leads, searchQuery, stageFilter]);

  // Stage Updater (Fixes Reversion & Enforces Quote Sent Rules)
  const handleUpdateStage = async (leadId: string, newStage: CrmLead['stage']) => {
    // Prevent manually choosing "Quote Sent" if quote hasn't been created
    if (newStage === 'Quote Sent') {
      alert("Notice: 'Quote Sent' stage is updated automatically when you click 'Send Offer to Customer' inside the Quote Builder!");
      return;
    }

    try {
      // Optimistic Local State Update
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
      );

      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, stage: newStage });
      }

      // Permanent Firestore Update
      await updateDoc(doc(db, 'inquiries', leadId), {
        stage: newStage,
        status: newStage,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error updating lead stage:', err);
    }
  };

  // Drawer Opener
  const handleOpenLeadDrawer = (lead: CrmLead) => {
    setSelectedLead(lead);
    setNewNoteText('');
    setDrawerOpen(true);
  };

  // Add Sales Note
  const handleAddSalesNote = async () => {
    if (!newNoteText.trim() || !selectedLead) return;
    setSavingNote(true);

    const newNote = {
      id: `note_${Date.now()}`,
      note: newNoteText.trim(),
      createdAt: new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const updatedNotes = [...(selectedLead.notes || []), newNote];

    try {
      await updateDoc(doc(db, 'inquiries', selectedLead.id), {
        notes: updatedNotes,
        updatedAt: new Date().toISOString(),
      });

      setSelectedLead({ ...selectedLead, notes: updatedNotes });
      setNewNoteText('');
    } catch (err) {
      console.error('Error adding sales note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  // Trigger Quote Builder Redirection
  const handleCreateQuoteForLead = (lead: CrmLead) => {
    setDrawerOpen(false);

    // 1. Store target inquiry/lead ID in localStorage for instant auto-loading
    localStorage.setItem('wsc_target_quote_inquiry_id', lead.id);

    // 2. Trigger parent navigation or dispatch custom event
    if (onNavigateToQuoteBuilder) {
      onNavigateToQuoteBuilder(lead);
    }

    window.dispatchEvent(
      new CustomEvent('open_quote_builder_for_lead', {
        detail: {
          inquiryId: lead.id,
          customerName: lead.customerName,
          customerPhone: lead.customerPhone,
          checkInDate: lead.checkInDate,
          checkOutDate: lead.checkOutDate,
          paxCount: lead.paxCount,
        },
      })
    );
  };

  // Dynamic Allowed Stages Dropdown Helper
  const getAllowedStagesForLead = (currentStage: CrmLead['stage']) => {
    const isQuoteSentOrBeyond = ['Quote Sent', 'Negotiation', 'Won', 'Lost'].includes(currentStage);

    if (isQuoteSentOrBeyond) {
      // Once Quote is Sent, post-quote stages unlock
      return ['Quote Sent', 'Negotiation', 'Won', 'Lost'];
    } else {
      // Pre-quote stages (Cannot select Quote Sent or post-quote stages manually)
      return ['New', 'Contacted'];
    }
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* HEADER BANNER */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6B0D24] rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-chart-line-up text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">
              {isSuperAdmin ? 'Master Sales Lead CRM &amp; Pipeline' : 'Resort Lead CRM &amp; Pipeline'}
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Manage incoming inquiries, sales pipelines, lead scores, and send custom quotation offers.
            </p>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'kanban' ? 'bg-[#6B0D24] text-white shadow-xs' : 'text-gray-600'
              }`}
            >
              📊 Kanban Board
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'table' ? 'bg-[#6B0D24] text-white shadow-xs' : 'text-gray-600'
              }`}
            >
              📋 Data Table
            </button>
          </div>
        </div>
      </div>

      {/* INFOGRAPHICS & GROWTH ANALYTICS METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50/70 border border-blue-100 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">Total Inquiries</span>
          <p className="text-2xl font-black text-blue-950 mt-1">{crmAnalytics.totalLeads}</p>
          <span className="text-[10px] font-bold text-blue-700">{crmAnalytics.newLeads} Uncontacted New</span>
        </div>

        <div className="bg-amber-50/70 border border-amber-100 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider block">Active Pipeline</span>
          <p className="text-2xl font-black text-amber-950 mt-1">{crmAnalytics.quotesSent}</p>
          <span className="text-[10px] font-bold text-amber-800">Quotes &amp; Offers Reverted</span>
        </div>

        <div className="bg-green-50/70 border border-green-100 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase text-green-700 tracking-wider block">Conversion Rate</span>
          <p className="text-2xl font-black text-green-950 mt-1">{crmAnalytics.conversionRate}%</p>
          <span className="text-[10px] font-bold text-green-800">{crmAnalytics.wonCount} Bookings Won</span>
        </div>

        <div className="bg-purple-50/70 border border-purple-100 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider block">Won Revenue Value</span>
          <p className="text-2xl font-black text-purple-950 mt-1">₹{formatCurrency(crmAnalytics.wonValue)}</p>
          <span className="text-[10px] font-bold text-purple-800">Confirmed Booking Revenue</span>
        </div>
      </div>

      {/* SEARCH & STAGE FILTER BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search leads by customer name, phone, or resort..."
          className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-[#6B0D24] w-full sm:w-80"
        />

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[10px] font-black uppercase text-gray-400">Stage:</span>
          {['ALL', ...PIPELINE_STAGES].map((st) => (
            <button
              key={st}
              onClick={() => setStageFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                stageFilter === st
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN VIEW AREA */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs w-full min-h-[400px]">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
            <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
            Syncing CRM pipeline...
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs font-bold uppercase tracking-wider">
            No leads found in this pipeline stage.
          </div>
        ) : viewMode === 'kanban' ? (
          /* ================= MODE 1: NON-OVERLAPPING HORIZONTAL KANBAN BOARD ================= */
          <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.stage === stage);

              return (
                <div
                  key={stage}
                  className="bg-stone-50/80 border border-stone-200 rounded-2xl p-3.5 space-y-3 shrink-0 w-[280px] min-w-[280px]"
                >
                  <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-900">{stage}</span>
                    <span className="bg-gray-200 text-gray-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {stageLeads.length}
                    </span>
                  </div>

                  <div className="space-y-3 min-h-[250px]">
                    {stageLeads.map((lead) => {
                      const isQuoteSent = ['Quote Sent', 'Negotiation', 'Won', 'Lost'].includes(lead.stage);

                      return (
                        <div
                          key={lead.id}
                          onClick={() => handleOpenLeadDrawer(lead)}
                          className="bg-white border border-gray-200 hover:border-[#6B0D24] rounded-xl p-3.5 shadow-2xs cursor-pointer transition space-y-2 group"
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="font-black text-gray-900 text-xs truncate group-hover:text-[#6B0D24]">
                              {lead.customerName}
                            </h4>
                            <span className="text-[9px] font-bold text-[#6B0D24] bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                              {lead.paxCount} Pax
                            </span>
                          </div>

                          {isSuperAdmin && (
                            <span className="text-[9px] font-bold text-[#6B0D24] block truncate">
                              🏢 {lead.resortName}
                            </span>
                          )}

                          <span className="text-[10px] text-gray-500 font-mono block">
                            📞 {lead.customerPhone || 'No Phone'}
                          </span>

                          <div className="text-[9px] text-gray-400 font-medium truncate">
                            📅 {lead.weddingDates || lead.checkInDate || 'TBD'}
                          </div>

                          {/* REVERT / MODIFY QUOTE BUTTON */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateQuoteForLead(lead);
                            }}
                            className={`w-full font-black py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition shadow-2xs mt-1 ${
                              isQuoteSent
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-[#6B0D24] hover:bg-[#520a1a] text-white'
                            }`}
                          >
                            {isQuoteSent ? '✏️ Modify Quote' : '⚡ Revert Quote'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= MODE 2: DATA TABLE ================= */
          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Customer Lead</th>
                  <th className="p-3.5">Contact Details</th>
                  <th className="p-3.5">Resort / Dates</th>
                  <th className="p-3.5">Pax</th>
                  <th className="p-3.5">Pipeline Stage</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {filteredLeads.map((lead) => {
                  const allowedStages = getAllowedStagesForLead(lead.stage);

                  return (
                    <tr key={lead.id} className="hover:bg-stone-50 transition">
                      <td className="p-3.5 font-bold text-gray-900">{lead.customerName}</td>
                      <td className="p-3.5 font-mono text-gray-600">{lead.customerPhone}</td>
                      <td className="p-3.5">
                        <p className="font-bold text-gray-800">{lead.resortName}</p>
                        <p className="text-[10px] text-gray-400">{lead.weddingDates || lead.checkInDate || 'TBD'}</p>
                      </td>
                      <td className="p-3.5 font-black text-[#6B0D24]">{lead.paxCount} Pax</td>
                      <td className="p-3.5">
                        <select
                          value={lead.stage}
                          onChange={(e) => handleUpdateStage(lead.id, e.target.value as any)}
                          className="bg-gray-50 border border-gray-200 text-xs font-bold rounded-lg p-1 outline-none"
                        >
                          {allowedStages.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleOpenLeadDrawer(lead)}
                          className="text-gray-700 font-bold hover:underline"
                        >
                          Inspect
                        </button>

                        <button
                          onClick={() => handleCreateQuoteForLead(lead)}
                          className="bg-[#6B0D24] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] uppercase"
                        >
                          ⚡ Revert Quote
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= LEAD ASSESSMENT SLIDE-OVER DRAWER ================= */}
      {drawerOpen && selectedLead && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full sm:max-w-xl h-full shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* DRAWER HEADER */}
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                  Lead Profile &amp; Assessment
                </span>
                <h3 className="font-black text-gray-900 text-base">{selectedLead.customerName}</h3>
              </div>

              <button
                onClick={() => setDrawerOpen(false)}
                className="bg-gray-200 hover:bg-black hover:text-white text-gray-700 font-black px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
              >
                ✖ Close
              </button>
            </div>

            {/* DRAWER SCROLLABLE BODY */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs font-sans">
              {/* STAGE UPDATER & QUICK REVERT */}
              <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-gray-400">Current Pipeline Stage:</span>
                  <select
                    value={selectedLead.stage}
                    onChange={(e) => handleUpdateStage(selectedLead.id, e.target.value as any)}
                    className="bg-white border border-gray-300 font-black text-xs text-[#6B0D24] rounded-xl px-3 py-1.5 outline-none"
                  >
                    {getAllowedStagesForLead(selectedLead.stage).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => handleCreateQuoteForLead(selectedLead)}
                  className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚡ Create &amp; Revert Quote in Builder</span>
                </button>
              </div>

              {/* LEAD DETAILS */}
              <div className="bg-white border border-gray-200 p-4 rounded-2xl space-y-2">
                <p className="flex justify-between">
                  <span className="text-gray-400 font-bold">Resort:</span>
                  <span className="font-bold text-gray-900">{selectedLead.resortName}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-400 font-bold">Mobile Phone:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedLead.customerPhone || 'N/A'}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-400 font-bold">Guest Pax Count:</span>
                  <span className="font-black text-[#6B0D24]">{selectedLead.paxCount} Pax</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-400 font-bold">Event Dates:</span>
                  <span className="font-bold text-gray-800">{selectedLead.weddingDates || selectedLead.checkInDate || 'TBD'}</span>
                </p>
              </div>

              {/* DIRECT CONTACT ACTIONS */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    const clean = selectedLead.customerPhone.replace(/[^0-9]/g, '');
                    window.open(`https://wa.me/${clean}?text=Hi%20${selectedLead.customerName},%20reaching%20out%20regarding%20your%20wedding%20inquiry%20for%20${selectedLead.resortName}!`, '_blank');
                  }}
                  className="bg-[#25D366] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  💬 WhatsApp Direct
                </button>

                <button
                  onClick={() => window.open(`tel:${selectedLead.customerPhone}`, '_self')}
                  className="bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  📞 Direct Call
                </button>
              </div>

              {/* INTERNAL SALES NOTES */}
              <div className="space-y-3 pt-2 border-t">
                <h4 className="font-black text-xs text-gray-900 uppercase">Internal Sales Notes ({selectedLead.notes?.length || 0})</h4>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(selectedLead.notes || []).map((n) => (
                    <div key={n.id} className="bg-stone-50 border p-3 rounded-xl text-xs space-y-1">
                      <p className="text-gray-800 font-medium">{n.note}</p>
                      <span className="text-[9px] text-gray-400 font-mono block">{n.createdAt}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-1">
                  <textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Type internal sales note e.g. Customer requested extra rooms..."
                    rows={2}
                    className="w-full bg-gray-50 border rounded-xl p-2.5 text-xs font-medium outline-none focus:border-[#6B0D24]"
                  />
                  <button
                    onClick={handleAddSalesNote}
                    disabled={savingNote}
                    className="w-full bg-gray-900 text-white font-bold py-2 rounded-xl text-xs uppercase cursor-pointer"
                  >
                    {savingNote ? 'Saving...' : 'Add Sales Note'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}