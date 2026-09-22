'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AdminPartnerNavbarProps {
  portalType: 'admin' | 'partner';
  resortId?: string;
  resortName?: string;
  userName?: string;
  onLogout?: () => void;
}

interface NotificationItem {
  id: string;
  notifType: 'approval' | 'inquiry' | 'ticket';
  ticketId?: string;
  leadId?: string;
  title: string;
  message: string;
  status?: string;
  rejectionReason?: string;
  timestamp: number;
  dateDisplay: string;
}

export default function AdminPartnerNavbar({
  portalType,
  resortId,
  resortName,
  userName,
  onLogout,
}: AdminPartnerNavbarProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const isPartner = portalType === 'partner';
  const isAdmin = portalType === 'admin';

  // REALTIME FIRESTORE LISTENERS FOR APPROVALS, CRM LEADS & SUPPORT TICKETS
  useEffect(() => {
    let approvalNotifs: NotificationItem[] = [];
    let inquiryNotifs: NotificationItem[] = [];
    let ticketNotifs: NotificationItem[] = [];

    const combineAndRenderNotifs = () => {
      const combined = [...approvalNotifs, ...inquiryNotifs, ...ticketNotifs];
      combined.sort((a, b) => b.timestamp - a.timestamp);

      setNotifications(combined);

      const notifKey = isPartner ? `wsc_notif_read_${resortId}` : 'wsc_admin_notif_read';
      const lastRead = Number(localStorage.getItem(notifKey) || 0);
      const unread = combined.filter((n) => n.timestamp > lastRead).length;

      setUnreadCount(unread);
    };

    // 1. LISTEN TO APPROVAL REQUESTS
    const unsubApproval = onSnapshot(
      collection(db, 'partner_approval_requests'),
      (snap) => {
        const list: NotificationItem[] = [];
        snap.forEach((d) => {
          const data = d.data();

          if (isAdmin) {
            if (data.status === 'pending') {
              const timeObj = new Date(data.submittedAt || Date.now());
              list.push({
                id: d.id,
                notifType: 'approval',
                title: `📩 Approval Request: ${data.resortName || 'Resort'}`,
                message: `${data.partnerName || 'Partner'} submitted a ${
                  data.type === 'gallery_update' ? 'Gallery Photo' : 'Pricing Tier'
                } update for review.`,
                status: 'pending',
                timestamp: timeObj.getTime(),
                dateDisplay: timeObj.toLocaleDateString('en-IN'),
              });
            }
          } else if (isPartner && resortId) {
            const isMyResort = data.resortId === resortId || String(data.resortId) === String(resortId);

            if (isMyResort && (data.status === 'approved' || data.status === 'rejected')) {
              const timeObj = new Date(
                data.approvedAt || data.rejectedAt || data.submittedAt || Date.now()
              );

              let messageText = 'Your request was approved by Super Admin and is now live on your page!';
              if (data.status === 'rejected') {
                messageText = `Rejected by Super Admin: "${data.rejectionReason || 'Does not meet guidelines.'}"`;
              }

              list.push({
                id: d.id,
                notifType: 'approval',
                title: data.type === 'gallery_update' ? 'Gallery Photo Update' : 'Pricing Tier Update',
                message: messageText,
                status: data.status,
                rejectionReason: data.rejectionReason,
                timestamp: timeObj.getTime(),
                dateDisplay: timeObj.toLocaleDateString('en-IN'),
              });
            }
          }
        });
        approvalNotifs = list;
        combineAndRenderNotifs();
      },
      (error) => {
        console.error('Error listening to approval notifications:', error);
      }
    );

    // 2. LISTEN TO REALTIME CRM LEADS (`inquiries`)
    const unsubInquiries = onSnapshot(
      collection(db, 'inquiries'),
      (snap) => {
        const list: NotificationItem[] = [];
        snap.forEach((d) => {
          const data = d.data();

          if (isAdmin) {
            let timeObj = new Date();
            if (data.submittedAt) timeObj = new Date(data.submittedAt);
            else if (data.timestamp) timeObj = new Date(data.timestamp);

            const custName = data.customerName || data.userName || data.name || 'New Lead';
            const resortNameVal = data.resortName || 'Resort';

            list.push({
              id: d.id,
              leadId: d.id,
              notifType: 'inquiry',
              title: `📩 CRM Lead: ${custName} (${resortNameVal})`,
              message: `New sales lead submitted. Click to inspect profile and revert quote.`,
              timestamp: timeObj.getTime(),
              dateDisplay: timeObj.toLocaleDateString('en-IN'),
            });
          } else if (isPartner && resortId) {
            if (data.resortId === resortId || String(data.resortId) === String(resortId)) {
              let timeObj = new Date();
              if (data.submittedAt) timeObj = new Date(data.submittedAt);
              else if (data.timestamp) timeObj = new Date(data.timestamp);

              const custName = data.customerName || data.userName || data.name || 'New Lead';
              const pax = data.guests || data.pax || data.guestCount || 200;
              const dates = data.weddingDates || data.weddingDate || data.date || 'TBD';

              list.push({
                id: d.id,
                leadId: d.id,
                notifType: 'inquiry',
                title: `📩 New CRM Lead: ${custName}`,
                message: `Requested quote for ${pax} Guests (${dates}). Click to view lead CRM.`,
                timestamp: timeObj.getTime(),
                dateDisplay: timeObj.toLocaleDateString('en-IN'),
              });
            }
          }
        });
        inquiryNotifs = list;
        combineAndRenderNotifs();
      },
      (error) => {
        console.error('Error listening to inquiry notifications:', error);
      }
    );

    // 3. LISTEN TO SUPPORT TICKETS
    const unsubTickets = onSnapshot(
      collection(db, 'support_tickets'),
      (snap) => {
        const list: NotificationItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const msgs = data.messages || [];
          const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

          if (isAdmin) {
            const isPartnerSender = lastMsg ? lastMsg.sender === 'partner' : data.status === 'Open';

            if (data.status !== 'Closed' && isPartnerSender) {
              const timeObj = new Date(
                lastMsg?.timestamp || data.updatedAt || data.createdAt || Date.now()
              );

              list.push({
                id: d.id,
                ticketId: d.id,
                notifType: 'ticket',
                title: `🎫 Ticket: ${data.resortName || 'Partner'} (${data.partnerName})`,
                message: `[${data.priority} Priority] ${data.subject}. Click to reply in Helpdesk.`,
                status: data.status,
                timestamp: timeObj.getTime(),
                dateDisplay: timeObj.toLocaleDateString('en-IN'),
              });
            }
          } else if (isPartner && resortId) {
            const isMyResort = data.resortId === resortId || String(data.resortId) === String(resortId);
            const isAdminSender = lastMsg && lastMsg.sender === 'admin';

            if (isMyResort && isAdminSender) {
              const timeObj = new Date(
                lastMsg.timestamp || data.updatedAt || data.createdAt || Date.now()
              );

              list.push({
                id: d.id,
                ticketId: d.id,
                notifType: 'ticket',
                title: `🎫 Admin Reply: ${data.subject}`,
                message: `Super Admin replied: "${lastMsg.message}". Click to view conversation.`,
                status: data.status,
                timestamp: timeObj.getTime(),
                dateDisplay: timeObj.toLocaleDateString('en-IN'),
              });
            }
          }
        });
        ticketNotifs = list;
        combineAndRenderNotifs();
      },
      (error) => {
        console.error('Error listening to ticket notifications:', error);
      }
    );

    return () => {
      unsubApproval();
      unsubInquiries();
      unsubTickets();
    };
  }, [portalType, resortId, isAdmin, isPartner]);

  // Open notification dropdown & mark as read
  const handleToggleNotifications = () => {
    const nextState = !notifOpen;
    setNotifOpen(nextState);

    if (nextState) {
      const notifKey = isPartner ? `wsc_notif_read_${resortId}` : 'wsc_admin_notif_read';
      localStorage.setItem(notifKey, String(Date.now()));
      setUnreadCount(0);
    }
  };

  // Handle Notification Item Click
  const handleNotificationClick = (item: NotificationItem) => {
    setNotifOpen(false);

    if (item.notifType === 'ticket' && item.ticketId) {
      localStorage.setItem('wsc_target_open_ticket_id', item.ticketId);

      window.dispatchEvent(
        new CustomEvent('open_support_ticket', {
          detail: { ticketId: item.ticketId },
        })
      );
    } else if (item.notifType === 'inquiry' && item.leadId) {
      localStorage.setItem('wsc_target_open_lead_id', item.leadId);

      window.dispatchEvent(
        new CustomEvent('open_crm_lead', {
          detail: { leadId: item.leadId },
        })
      );
    }
  };

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
        {/* Left: Brand Logo & Dedicated Portal Badge */}
        <div className="flex items-center gap-3">
          <Link
            href={portalType === 'admin' ? '/admin' : '/resort-partner'}
            className="flex items-center"
          >
            <img
              src="https://firebasestorage.googleapis.com/v0/b/saas-c8ee9.firebasestorage.app/o/uploads%2Fthumbnails%2F1774539682469_Gemini_Generated_Image_6vv0m66vv0m66vv0-removebg-preview%20(1).webp?alt=media&token=81e74d46-ca11-4d55-bdd7-3ccada95aecf"
              alt="Logo"
              className="h-16 md:h-20 w-auto object-contain"
            />
          </Link>
          <span className="bg-[#6B0D24] text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-2xs">
            {portalType === 'admin' ? 'Command Center' : 'Partner Portal'}
          </span>
        </div>

        {/* Right: Notifications, Resort Badge & Logout */}
        <div className="flex items-center gap-3">
          {/* NOTIFICATION BELL */}
          <div className="relative">
            <button
              onClick={handleToggleNotifications}
              className="relative w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-[#6B0D24] flex items-center justify-center transition cursor-pointer"
              title="Notifications"
            >
              <i className="ph-fill ph-bell text-lg"></i>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-bounce shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* NOTIFICATIONS POPOVER DROPDOWN */}
            {notifOpen && (
              <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-200 p-5 z-[100000] space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <i className="ph-fill ph-bell text-[#6B0D24] text-base"></i>
                    <h4 className="font-black text-gray-900 text-sm">
                      {isAdmin ? 'Command Center Notifications' : 'Notifications &amp; Helpdesk'}
                    </h4>
                  </div>
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="text-gray-400 hover:text-black font-bold text-xs cursor-pointer"
                  >
                    ✖
                  </button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-xs font-bold">
                      No new notifications. Alerts for inquiries, ticket replies, and approvals will appear here live.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-3.5 rounded-2xl border text-xs space-y-1 cursor-pointer transition ${
                          n.notifType === 'ticket'
                            ? 'bg-blue-50/80 border-blue-200 text-blue-950 hover:bg-blue-100/80'
                            : n.notifType === 'inquiry'
                            ? 'bg-amber-50/80 border-amber-200 text-amber-950 hover:bg-amber-100/80'
                            : n.status === 'approved'
                            ? 'bg-green-50/70 border-green-200 text-green-950 hover:bg-green-100/70'
                            : 'bg-red-50/70 border-red-200 text-red-950 hover:bg-red-100/70'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                              n.notifType === 'ticket'
                                ? 'bg-blue-600 text-white'
                                : n.notifType === 'inquiry'
                                ? 'bg-amber-500 text-white'
                                : n.status === 'approved'
                                ? 'bg-green-600 text-white'
                                : 'bg-red-600 text-white'
                            }`}
                          >
                            {n.notifType === 'ticket'
                              ? '🎫 Support Ticket'
                              : n.notifType === 'inquiry'
                              ? '📩 New CRM Lead'
                              : n.status === 'approved'
                              ? '✓ Approved'
                              : '✕ Rejected'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {n.dateDisplay}
                          </span>
                        </div>

                        <p className="font-bold text-gray-900 pt-1">{n.title}</p>

                        <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {resortName && (
            <div className="hidden sm:flex items-center gap-1.5 bg-[#FAF6F0] border border-[#6B0D24]/15 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-900">
              <i className="ph-fill ph-buildings text-[#6B0D24]"></i>
              <span>{resortName}</span>
            </div>
          )}

          {userName && (
            <span className="hidden md:inline-block text-xs font-black uppercase tracking-wider text-[#6B0D24] bg-[#6B0D24]/5 px-3 py-1.5 rounded-xl border border-[#6B0D24]/10">
              {userName}
            </span>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="bg-stone-100 hover:bg-stone-200 text-[#6B0D24] border border-stone-200 font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}