'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  updateDoc,
  addDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface PartnerSupportTicketModuleProps {
  resortId?: string;
  partnerData?: any;
  resortData?: any;
  isSuperAdmin?: boolean;
}

export interface TicketMessage {
  id: string;
  sender: 'partner' | 'admin';
  senderName: string;
  message: string;
  attachmentUrl?: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  resortId: string;
  resortName: string;
  partnerName: string;
  partnerEmail: string;
  partnerPhone: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  subject: string;
  description: string;
  attachmentUrl?: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export default function PartnerSupportTicketModule({
  resortId,
  partnerData,
  resortData,
  isSuperAdmin = false,
}: PartnerSupportTicketModuleProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'view'>('create');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Form State (New Ticket)
  const [category, setCategory] = useState('Technical Issue');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Conversation Reply State
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  // --- FETCH TICKETS ---
  const fetchTickets = async () => {
    try {
      const list: SupportTicket[] = [];

      if (isSuperAdmin) {
        const snap = await getDocs(collection(db, 'support_tickets'));
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as SupportTicket);
        });
      } else if (resortId) {
        const q = query(
          collection(db, 'support_tickets'),
          where('resortId', '==', String(resortId))
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as SupportTicket);
        });
      }

      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setTickets(list);

      // Check if target ticket needs to be auto-opened from localStorage
      const targetTicketId = localStorage.getItem('wsc_target_open_ticket_id');
      if (targetTicketId) {
        const target = list.find((t) => t.id === targetTicketId);
        if (target) {
          handleOpenViewDrawer(target);
          localStorage.removeItem('wsc_target_open_ticket_id');
        } else {
          getDoc(doc(db, 'support_tickets', targetTicketId)).then((snap) => {
            if (snap.exists()) {
              handleOpenViewDrawer({ id: snap.id, ...snap.data() } as SupportTicket);
              localStorage.removeItem('wsc_target_open_ticket_id');
            }
          });
        }
      } else if (selectedTicket) {
        const updatedSelected = list.find((t) => t.id === selectedTicket.id);
        if (updatedSelected) setSelectedTicket(updatedSelected);
      }
    } catch (err) {
      console.error('Error fetching support tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();

    const intervalId = setInterval(() => {
      fetchTickets();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [resortId, isSuperAdmin]);

  // LISTEN TO NAVBAR NOTIFICATION CLICK EVENT
  useEffect(() => {
    const handleOpenTicketEvent = async (event: any) => {
      const targetTicketId = event.detail?.ticketId || localStorage.getItem('wsc_target_open_ticket_id');
      if (targetTicketId) {
        try {
          const snap = await getDoc(doc(db, 'support_tickets', targetTicketId));
          if (snap.exists()) {
            handleOpenViewDrawer({ id: snap.id, ...snap.data() } as SupportTicket);
            localStorage.removeItem('wsc_target_open_ticket_id');
          }
        } catch (e) {}
      }
    };

    window.addEventListener('open_support_ticket', handleOpenTicketEvent);
    return () => window.removeEventListener('open_support_ticket', handleOpenTicketEvent);
  }, [tickets]);

  const handleOpenCreateDrawer = () => {
    setDrawerMode('create');
    setSubject('');
    setDescription('');
    setSelectedFile(null);
    setCategory('Technical Issue');
    setPriority('Medium');
    setDrawerOpen(true);
  };

  const handleOpenViewDrawer = (ticket: SupportTicket) => {
    setDrawerMode('view');
    setSelectedTicket(ticket);
    setReplyText('');
    setReplyFile(null);
    setDrawerOpen(true);
  };

  // SUBMIT NEW TICKET
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      alert('Please fill in Subject and Description.');
      return;
    }

    setSubmitting(true);
    const ticketId = `ticket_${Date.now()}`;
    let attachmentUrl = '';

    try {
      if (selectedFile) {
        const cleanName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `support_attachments/${Date.now()}_${cleanName}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        attachmentUrl = await getDownloadURL(snapshot.ref);
      }

      const initialMessage: TicketMessage = {
        id: `msg_${Date.now()}`,
        sender: 'partner',
        senderName: partnerData?.partnerName || 'Resort Partner',
        message: description.trim(),
        attachmentUrl: attachmentUrl,
        timestamp: new Date().toISOString(),
      };

      const newTicket: SupportTicket = {
        id: ticketId,
        resortId: resortId || 'General',
        resortName: resortData?._recordName || resortData?.core_name || partnerData?.resortName || 'Resort Partner',
        partnerName: partnerData?.partnerName || 'Resort Partner',
        partnerEmail: partnerData?.email || '',
        partnerPhone: partnerData?.phone || '',
        category: category,
        priority: priority,
        subject: subject.trim(),
        description: description.trim(),
        attachmentUrl: attachmentUrl,
        status: 'Open',
        messages: [initialMessage],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'support_tickets', ticketId), newTicket);

      // INSTANTLY MARK LOCAL DEVICE READ FOR PARTNER
      if (resortId) {
        localStorage.setItem(`wsc_notif_read_${resortId}`, String(Date.now()));
      }

      alert('✅ Ticket submitted successfully! Super Admin has been notified.');
      setDrawerOpen(false);
      await fetchTickets();
    } catch (err: any) {
      console.error('Submit ticket error:', err);
      alert('Failed to submit ticket: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // SEND THREAD REPLY
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    setSendingReply(true);
    let replyAttachmentUrl = '';

    try {
      if (replyFile) {
        const cleanName = replyFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `support_attachments/${Date.now()}_${cleanName}`);
        const snapshot = await uploadBytes(storageRef, replyFile);
        replyAttachmentUrl = await getDownloadURL(snapshot.ref);
      }

      const newMsg: TicketMessage = {
        id: `msg_${Date.now()}`,
        sender: isSuperAdmin ? 'admin' : 'partner',
        senderName: isSuperAdmin ? 'Super Admin' : selectedTicket.partnerName,
        message: replyText.trim(),
        attachmentUrl: replyAttachmentUrl,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...(selectedTicket.messages || []), newMsg];
      const newStatus = isSuperAdmin ? 'In Progress' : 'Open';

      await updateDoc(doc(db, 'support_tickets', selectedTicket.id), {
        messages: updatedMessages,
        status: selectedTicket.status === 'Closed' ? 'Closed' : newStatus,
        updatedAt: new Date().toISOString(),
      });

      // INSTANTLY MARK LOCAL DEVICE READ SO SENDER NEVER GETS UNREAD NOTIFICATION BADGE
      if (isSuperAdmin) {
        localStorage.setItem('wsc_admin_notif_read', String(Date.now()));
      } else if (resortId) {
        localStorage.setItem(`wsc_notif_read_${resortId}`, String(Date.now()));
      }

      setReplyText('');
      setReplyFile(null);
      await fetchTickets();
    } catch (err: any) {
      console.error('Send reply error:', err);
      alert('Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    if (!confirm('Mark this support ticket as CLOSED?')) return;

    try {
      await updateDoc(doc(db, 'support_tickets', selectedTicket.id), {
        status: 'Closed',
        updatedAt: new Date().toISOString(),
      });

      // INSTANTLY MARK LOCAL DEVICE READ
      if (isSuperAdmin) {
        localStorage.setItem('wsc_admin_notif_read', String(Date.now()));
      } else if (resortId) {
        localStorage.setItem(`wsc_notif_read_${resortId}`, String(Date.now()));
      }

      alert('✅ Ticket marked as Closed.');
      await fetchTickets();
      setDrawerOpen(false);
    } catch (err: any) {
      console.error('Close ticket error:', err);
      alert('Failed to close ticket.');
    }
  };

  const filteredTickets = useMemo(() => {
    if (statusFilter === 'ALL') return tickets;
    return tickets.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  return (
    <div className="space-y-6 w-full font-sans">
      {/* HEADER BANNER */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6B0D24] rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-headset text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">
              {isSuperAdmin ? 'Support Tickets Command Center' : 'Partner Helpdesk &amp; Support'}
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              {isSuperAdmin
                ? 'Review and resolve support tickets submitted by resort partners.'
                : 'Raise a ticket for technical issues, rate card help, or platform inquiries.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses ({tickets.length})</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>

          {!isSuperAdmin && (
            <button
              onClick={handleOpenCreateDrawer}
              className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
            >
              + Raise Ticket
            </button>
          )}
        </div>
      </div>

      {/* DASHBOARD CONTENT LIST */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs w-full">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
            <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
            Loading support tickets...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs font-bold uppercase tracking-wider space-y-3">
            <i className="ph-bold ph-headset text-4xl text-gray-300 block mx-auto"></i>
            <p>No support tickets found.</p>
            {!isSuperAdmin && (
              <button
                onClick={handleOpenCreateDrawer}
                className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer"
              >
                Raise First Ticket
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        ticket.status === 'Resolved'
                          ? 'bg-green-100 text-green-800'
                          : ticket.status === 'In Progress'
                          ? 'bg-blue-100 text-blue-800'
                          : ticket.status === 'Closed'
                          ? 'bg-gray-200 text-gray-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {ticket.status}
                    </span>

                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        ticket.priority === 'Urgent'
                          ? 'bg-red-600 text-white'
                          : ticket.priority === 'High'
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ticket.priority} Priority
                    </span>
                  </div>

                  {isSuperAdmin && (
                    <span className="text-[10px] font-black text-[#6B0D24] block">
                      🏢 {ticket.resortName} ({ticket.partnerName})
                    </span>
                  )}

                  <h4 className="font-black text-gray-900 text-sm leading-tight">{ticket.subject}</h4>

                  <span className="text-[10px] font-bold text-gray-400 block">
                    Category: {ticket.category} &bull; {new Date(ticket.updatedAt).toLocaleDateString()}
                  </span>

                  <p className="text-xs text-gray-600 font-medium line-clamp-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                    "{ticket.description}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                    <span>💬 {ticket.messages?.length || 1} Message(s)</span>
                    {ticket.attachmentUrl && <span className="text-blue-600">📷 Screenshot</span>}
                  </div>
                </div>

                <button
                  onClick={() => handleOpenViewDrawer(ticket)}
                  className="w-full mt-2 bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  View Thread &amp; Reply &rarr;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================= SLIDE-OVER SIDE DRAWER (THREAD & CONVERSATION) ================= */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full sm:max-w-xl h-full shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* DRAWER HEADER */}
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                  {drawerMode === 'create'
                    ? 'Helpdesk Support'
                    : `Ticket #${selectedTicket?.id.substring(selectedTicket.id.length - 6)}`}
                </span>
                <h3 className="font-black text-gray-900 text-base">
                  {drawerMode === 'create' ? 'Raise New Support Ticket' : selectedTicket?.subject}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {drawerMode === 'view' && selectedTicket && selectedTicket.status !== 'Closed' && (
                  <button
                    onClick={handleCloseTicket}
                    className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer border border-red-200"
                  >
                    🔒 Close Ticket
                  </button>
                )}

                <button
                  onClick={() => setDrawerOpen(false)}
                  className="bg-gray-200 hover:bg-black hover:text-white text-gray-700 font-black px-3 py-1.5 rounded-xl text-xs transition cursor-pointer"
                >
                  ✖ Close
                </button>
              </div>
            </div>

            {/* DRAWER BODY */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs font-sans">
              {drawerMode === 'create' ? (
                /* CREATE FORM */
                <form id="createTicketForm" onSubmit={handleSubmitTicket} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                        Issue Category *
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold text-xs outline-none focus:border-[#6B0D24]"
                      >
                        <option value="Technical Issue">Technical Issue / Bug</option>
                        <option value="Pricing & Rates">Pricing &amp; Rate Card Help</option>
                        <option value="Inquiry & Leads">Inquiries &amp; Customer Leads</option>
                        <option value="Gallery & Media">Gallery Photos &amp; 360 Tour</option>
                        <option value="Account & Billing">Account &amp; Partnership Settings</option>
                        <option value="Other">Other Query</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                        Priority Level *
                      </label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as any)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold text-xs outline-none focus:border-[#6B0D24]"
                      >
                        <option value="Low">Low - General Question</option>
                        <option value="Medium">Medium - Standard Request</option>
                        <option value="High">High - Impacting Operations</option>
                        <option value="Urgent">Urgent - Urgent Assistance Required</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                      Ticket Subject *
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Unable to update Gala Dinner parameter rate"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold text-xs outline-none focus:border-[#6B0D24]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                      Problem Description / Details *
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder="Provide complete details about the problem or assistance needed..."
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:border-[#6B0D24] leading-relaxed"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                      Attach Screenshot / Image (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 text-xs font-bold text-gray-700 cursor-pointer"
                    />
                  </div>
                </form>
              ) : (
                /* CONTINUOUS CONVERSATION THREAD */
                selectedTicket && (
                  <div className="space-y-4">
                    <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-2xl space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-gray-500">
                        <span>Category: {selectedTicket.category}</span>
                        <span
                          className={`font-black uppercase px-2 py-0.5 rounded ${
                            selectedTicket.status === 'Closed' ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-900'
                          }`}
                        >
                          Status: {selectedTicket.status}
                        </span>
                      </div>
                      <p className="font-bold text-gray-900 text-xs">{selectedTicket.subject}</p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {(selectedTicket.messages || []).map((msg) => {
                        const isAdminMsg = msg.sender === 'admin';

                        return (
                          <div
                            key={msg.id}
                            className={`p-3.5 rounded-2xl text-xs space-y-1 max-w-[85%] ${
                              isAdminMsg
                                ? 'bg-blue-50 border border-blue-200 ml-auto text-blue-950'
                                : 'bg-stone-100 border border-stone-200 mr-auto text-stone-950'
                            }`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-black text-[10px] uppercase">
                                {isAdminMsg ? '🛡️ Super Admin' : `👤 ${msg.senderName || 'Partner'}`}
                              </span>
                              <span className="text-[9px] text-gray-400 font-mono">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <p className="font-medium whitespace-pre-line leading-relaxed">{msg.message}</p>

                            {msg.attachmentUrl && (
                              <div className="pt-2">
                                <a href={msg.attachmentUrl} target="_blank" rel="noreferrer">
                                  <img
                                    src={msg.attachmentUrl}
                                    alt="Attachment"
                                    className="max-h-36 rounded-xl border border-gray-200 object-cover"
                                  />
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* DRAWER FOOTER */}
            {drawerMode === 'create' ? (
              <div className="p-4 bg-gray-50 border-t flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="createTicketForm"
                  disabled={submitting}
                  className="flex-1 bg-[#6B0D24] text-white font-black py-2.5 rounded-xl text-xs uppercase shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            ) : (
              selectedTicket &&
              selectedTicket.status !== 'Closed' && (
                <form onSubmit={handleSendReply} className="p-4 bg-gray-50 border-t space-y-2 shrink-0">
                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={
                        isSuperAdmin
                          ? 'Type response to partner...'
                          : 'Type reply to admin...'
                      }
                      rows={2}
                      className="flex-1 bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-[#6B0D24] resize-none"
                      required
                    />

                    <button
                      type="submit"
                      disabled={sendingReply}
                      className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-4 rounded-xl text-xs uppercase cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {sendingReply ? 'Sending...' : 'Send'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
                      className="text-[10px] font-bold cursor-pointer"
                    />
                  </div>
                </form>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}