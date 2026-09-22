'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface LeadUser {
  uid: string;
  name: string;
  phone: string;
  createdAt: number;
}

interface ActivityLog {
  id: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  action?: string;
  page?: string;
  details?: string;
  resortClickedId?: string;
  resortClickedName?: string;
  resortName?: string;
  guests?: string | number;
  checkInDate?: string;
  selectedEvents?: string[];
  selectedItems?: { name: string; id: string; qty: number; category?: string }[];
  timestamp?: any;
  displayDate?: string;
  displayTime?: string;
}

interface BudgetQuote {
  docId: string;
  userId: string;
  resortId?: string;
  resortName?: string;
  resortLocation?: string;
  resortImage?: string;
  guests?: number;
  days?: number;
  rooms?: number;
  functions?: number;
  checkInDate?: string;
  checkOutDate?: string;
  selectedItems?: any[];
  quotes?: any[];
  isFavorite?: boolean;
  hasVisited?: boolean;
  createdAt?: any;
}

interface FavoriteItem {
  resortId: string;
  resortName: string;
}

interface SalesNote {
  id: string;
  note: string;
  createdAt: any;
}

const formatCurrency = (num: number) => (num ? num.toLocaleString('en-IN') : '0');

export default function ActivityMonitorModule() {
  // Main Sub-Tab Mode: 'leads' | 'compare_logs' | 'all_activity'
  const [activeSubTab, setActiveSubTab] = useState<'leads' | 'compare_logs' | 'all_activity'>('leads');

  // Loading States
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingCompareLogs, setLoadingCompareLogs] = useState(false);
  const [loadingAllLogs, setLoadingAllLogs] = useState(false);

  // Core Datasets
  const [usersList, setUsersList] = useState<LeadUser[]>([]);
  const [userSort, setUserSort] = useState<'newest' | 'oldest' | 'name'>('newest');

  // Emulated Lead State
  const [selectedUser, setSelectedUser] = useState<LeadUser | null>(null);
  const [userBudgets, setUserBudgets] = useState<BudgetQuote[]>([]);
  const [userFavorites, setUserFavorites] = useState<FavoriteItem[]>([]);
  const [budgetSearch, setBudgetSearch] = useState('');

  // Lead Intelligence Stats
  const [avgBudget, setAvgBudget] = useState('0');
  const [topLocation, setTopLocation] = useState('-');
  const [leadTemp, setLeadTemp] = useState<'Cold' | 'Warm' | 'Hot'>('Cold');

  // Compare Engine Logs & All Activity Data
  const [compareLogs, setCompareLogs] = useState<ActivityLog[]>([]);
  const [allActivityLogs, setAllActivityLogs] = useState<ActivityLog[]>([]);

  // Modals & Drawers
  const [selectedLogDetail, setSelectedLogDetail] = useState<ActivityLog | null>(null);
  const [selectedItemsDrawerQuote, setSelectedItemsDrawerQuote] = useState<BudgetQuote | null>(null);
  const [selectedQuoteModalQuote, setSelectedQuoteModalQuote] = useState<BudgetQuote | null>(null);
  const [userActivityLogsModal, setUserActivityLogsModal] = useState<ActivityLog[] | null>(null);

  // Sales Notes Modal State
  const [salesNotesQuote, setSalesNotesQuote] = useState<BudgetQuote | null>(null);
  const [notesList, setNotesList] = useState<SalesNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // --- FETCH ALL LEADS ---
  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const list: LeadUser[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          name: data.name || 'Unknown User',
          phone: data.phone || 'No Phone',
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
        });
      });
      setUsersList(list);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchAllUsers();
  }, []);

  // Sort Users
  const sortedUsersList = useMemo(() => {
    const list = [...usersList];
    if (userSort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
    if (userSort === 'oldest') list.sort((a, b) => a.createdAt - b.createdAt);
    if (userSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [usersList, userSort]);

  // --- EMULATE LEAD & FETCH INTELLIGENCE ---
  const handleEmulateUser = async (user: LeadUser) => {
    setSelectedUser(user);
    setUserBudgets([]);
    setUserFavorites([]);

    try {
      // 1. Fetch Saved Budgets
      const qBudgets = query(collection(db, 'saved_budgets'), where('userId', '==', user.uid));
      const snapBudgets = await getDocs(qBudgets);
      const bList: BudgetQuote[] = [];
      const seenResorts = new Set();

      snapBudgets.forEach((docSnap) => {
        const b = docSnap.data() as BudgetQuote;
        b.docId = docSnap.id;
        if (b.resortId && b.resortId !== 'UNKNOWN') {
          if (seenResorts.has(b.resortId)) return;
          seenResorts.add(b.resortId);
        }
        bList.push(b);
      });

      // 2. Fetch Favorites
      const qFavs = query(collection(db, 'favorites'), where('userId', '==', user.uid));
      const snapFavs = await getDocs(qFavs);
      const fList: FavoriteItem[] = [];
      snapFavs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.resortName) {
          fList.push({
            resortId: data.resortId,
            resortName: data.resortName,
          });
        }
      });
      setUserFavorites(fList);

      // 3. Compute Lead Intelligence
      if (bList.length > 0) {
        let totalVal = 0;
        let count = 0;
        const locCounts: Record<string, number> = {};

        bList.forEach((b) => {
          if (b.quotes && b.quotes.length > 0) {
            const sortedQ = [...b.quotes].sort((x, y) => (x.grandTotal || 0) - (y.grandTotal || 0));
            totalVal += sortedQ[0].grandTotal || 0;
            count++;
          }
          if (b.resortLocation) {
            locCounts[b.resortLocation] = (locCounts[b.resortLocation] || 0) + 1;
          }
        });

        if (count > 0) {
          setAvgBudget(formatCurrency(Math.round(totalVal / count)));
        } else {
          setAvgBudget('0');
        }

        const topLoc = Object.keys(locCounts).reduce(
          (a, b) => (locCounts[a] > locCounts[b] ? a : b),
          '-'
        );
        setTopLocation(topLoc);

        if (count >= 3 || fList.length > 0) setLeadTemp('Hot');
        else if (count > 0) setLeadTemp('Warm');
        else setLeadTemp('Cold');
      } else {
        setAvgBudget('0');
        setTopLocation('-');
        setLeadTemp('Cold');
      }

      setUserBudgets(bList);
    } catch (err) {
      console.error('Error emulating lead:', err);
    }
  };

  // --- FETCH COMPARE LOGS ---
  const fetchCompareLogs = async () => {
    setLoadingCompareLogs(true);
    try {
      const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const logs: ActivityLog[] = [];

      snap.forEach((d) => {
        const data = d.data() as ActivityLog;
        if (data.page === 'Compare Resorts Engine') {
          let dateObj = new Date();
          if (data.timestamp?.toDate) dateObj = data.timestamp.toDate();
          else if (data.timestamp?.seconds) dateObj = new Date(data.timestamp.seconds * 1000);

          data.id = d.id;
          data.displayDate = dateObj.toLocaleDateString('en-IN');
          data.displayTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          logs.push(data);
        }
      });
      setCompareLogs(logs);
    } catch (err) {
      console.error('Error fetching compare logs:', err);
    } finally {
      setLoadingCompareLogs(false);
    }
  };

  // --- FETCH ALL ACTIVITY LOGS ---
  const fetchAllActivityLogs = async () => {
    setLoadingAllLogs(true);
    try {
      const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const logs: ActivityLog[] = [];

      snap.forEach((d) => {
        const data = d.data() as ActivityLog;
        let dateObj = new Date();
        if (data.timestamp?.toDate) dateObj = data.timestamp.toDate();
        else if (data.timestamp?.seconds) dateObj = new Date(data.timestamp.seconds * 1000);

        data.id = d.id;
        data.displayDate = dateObj.toLocaleDateString('en-IN');
        data.displayTime = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        logs.push(data);
      });
      setAllActivityLogs(logs);
    } catch (err) {
      console.error('Error fetching all activity logs:', err);
    } finally {
      setLoadingAllLogs(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'compare_logs') fetchCompareLogs();
    if (activeSubTab === 'all_activity') fetchAllActivityLogs();
  }, [activeSubTab]);

  // --- FETCH USER SPECIFIC LOGS FOR MODAL ---
  const handleViewUserActivityLogs = async (userId: string) => {
    try {
      const q = query(collection(db, 'activity_logs'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const logs: ActivityLog[] = [];
      snap.forEach((d) => logs.push({ id: d.id, ...d.data() } as ActivityLog));
      setUserActivityLogsModal(logs);
    } catch (err) {
      console.error('Error fetching user activity logs:', err);
    }
  };

  // --- SALES NOTES ---
  const handleOpenSalesNotes = async (quote: BudgetQuote) => {
    setSalesNotesQuote(quote);
    setNewNoteText('');
    try {
      const q = query(collection(db, 'sales_notes'), where('docId', '==', quote.docId));
      const snap = await getDocs(q);
      const notes: SalesNote[] = [];
      snap.forEach((d) => notes.push({ id: d.id, ...d.data() } as SalesNote));
      setNotesList(notes);
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  };

  const handleSaveSalesNote = async () => {
    if (!newNoteText.trim() || !salesNotesQuote) return;
    setSavingNote(true);
    try {
      await addDoc(collection(db, 'sales_notes'), {
        docId: salesNotesQuote.docId,
        userId: selectedUser?.uid || 'Unknown',
        phone: selectedUser?.phone || 'Unknown',
        note: newNoteText.trim(),
        createdAt: new Date(),
      });
      setNewNoteText('');
      await handleOpenSalesNotes(salesNotesQuote);
    } catch (err) {
      console.error('Error saving note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  // --- CONTACT HELPERS ---
  const contactWhatsApp = (phone: string, name: string, message = '') => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const defaultMsg = encodeURIComponent(
      message ||
        `Hi ${name}, reaching out regarding your wedding planning. I saw you were looking at resorts on our platform! How can I help you finalize?`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${defaultMsg}`, '_blank');
  };

  const filteredUserBudgets = useMemo(() => {
    if (!budgetSearch.trim()) return userBudgets;
    const q = budgetSearch.toLowerCase();
    return userBudgets.filter(
      (b) =>
        b.resortName?.toLowerCase().includes(q) ||
        b.resortLocation?.toLowerCase().includes(q)
    );
  }, [userBudgets, budgetSearch]);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* MODULE HEADER BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6B0D24] rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-chart-line-up text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">Activity Monitor &amp; Lead CRM</h2>
            <p className="text-xs text-gray-500 font-medium">
              Assess sales leads, custom calculated quotes, and real-time comparison engine activity.
            </p>
          </div>
        </div>

        {/* SUB-TAB MODE SWITCHER */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
          <button
            onClick={() => {
              setActiveSubTab('leads');
              setSelectedUser(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'leads' ? 'bg-[#6B0D24] text-white shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            👥 Lead CRM Directory
          </button>

          <button
            onClick={() => setActiveSubTab('compare_logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'compare_logs' ? 'bg-[#6B0D24] text-white shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            🔍 Compare Engine Logs
          </button>

          <button
            onClick={() => setActiveSubTab('all_activity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSubTab === 'all_activity' ? 'bg-[#6B0D24] text-white shadow-xs' : 'text-gray-600 hover:text-black'
            }`}
          >
            ⚡ Live Activity Stream
          </button>
        </div>
      </div>

      {/* MAIN CONTAINER WITH INTERNAL SCROLL */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 overflow-y-auto space-y-6 shadow-xs">
        {/* ================= MODE 1: LEAD CRM & DIRECTORY ================= */}
        {activeSubTab === 'leads' && (
          <div>
            {!selectedUser ? (
              /* LEAD DIRECTORY LIST */
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Lead Directory ({usersList.length})</h3>
                    <p className="text-xs text-gray-500">Select a lead to access quotes, favorites, and intent data.</p>
                  </div>

                  <select
                    value={userSort}
                    onChange={(e) => setUserSort(e.target.value as any)}
                    className="bg-gray-50 border border-gray-200 font-bold text-xs rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="newest">Newest Leads First</option>
                    <option value="oldest">Oldest Leads First</option>
                    <option value="name">Sort by Name</option>
                  </select>
                </div>

                {loadingUsers ? (
                  <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                    <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
                    Fetching lead directory...
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3.5">Lead Details</th>
                          <th className="p-3.5">Phone Number</th>
                          <th className="p-3.5">Joined Date</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                        {sortedUsersList.map((u) => {
                          const dateStr =
                            u.createdAt > 0
                              ? new Date(u.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'Unknown';

                          return (
                            <tr key={u.uid} className="hover:bg-stone-50/60 transition">
                              <td className="p-3.5 font-bold text-gray-900 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center shrink-0">
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                                <span>{u.name}</span>
                              </td>
                              <td className="p-3.5 font-mono text-gray-600">{u.phone}</td>
                              <td className="p-3.5 text-gray-400">{dateStr}</td>
                              <td className="p-3.5 text-right">
                                <button
                                  onClick={() => handleEmulateUser(u)}
                                  className="bg-white border border-gray-200 hover:border-[#6B0D24] text-gray-800 font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer shadow-2xs"
                                >
                                  Assess Lead &rarr;
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
            ) : (
              /* INDIVIDUAL LEAD DASHBOARD */
              <div className="space-y-6">
                {/* LEAD BANNER */}
                <div className="bg-gray-900 text-white p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <span className="text-[10px] text-blue-300 font-bold uppercase tracking-widest block mb-0.5">
                      Assessing Lead Profile
                    </span>
                    <h3 className="font-black text-xl text-white">{selectedUser.name}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedUser.phone}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleViewUserActivityLogs(selectedUser.uid)}
                      className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      📜 Activity Logs
                    </button>
                    <button
                      onClick={() => contactWhatsApp(selectedUser.phone, selectedUser.name)}
                      className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      💬 WhatsApp
                    </button>
                    <button
                      onClick={() => window.open(`tel:${selectedUser.phone}`, '_self')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      📞 Call
                    </button>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer ml-2"
                    >
                      &larr; Back to Directory
                    </button>
                  </div>
                </div>

                {/* LEAD INTELLIGENCE CARDS */}
                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-500 block">Avg Budget Intent</span>
                    <p className="text-xl font-black text-blue-900">₹{avgBudget}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-500 block">Top Preferred Location</span>
                    <p className="text-xl font-black text-blue-900 truncate" title={topLocation}>
                      {topLocation}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-blue-500 block">Lead Temperature</span>
                    <p className="text-xl font-black flex items-center gap-1">
                      {leadTemp === 'Hot' ? (
                        <span className="text-red-600">🔥 Hot Lead</span>
                      ) : leadTemp === 'Warm' ? (
                        <span className="text-amber-600">⚡ Warm Lead</span>
                      ) : (
                        <span className="text-blue-500">❄️ Cold Lead</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* SAVED FAVORITES */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 mb-3">
                    ❤️ Saved Favorites ({userFavorites.length})
                  </h4>
                  {userFavorites.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No favorite resorts saved by this user.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {userFavorites.map((f, idx) => (
                        <div
                          key={idx}
                          className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center font-bold text-sm shrink-0">
                            ❤️
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-gray-900 truncate">{f.resortName}</h5>
                            <a
                              href={`/resort/${f.resortId}`}
                              target="_blank"
                              className="text-[10px] text-blue-600 font-bold hover:underline"
                            >
                              View Resort ↗
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CALCULATED QUOTES */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">
                      🧮 Calculated Quotes ({filteredUserBudgets.length})
                    </h4>
                    <input
                      type="text"
                      value={budgetSearch}
                      onChange={(e) => setBudgetSearch(e.target.value)}
                      placeholder="Search quotes..."
                      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none"
                    />
                  </div>

                  {filteredUserBudgets.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No calculated quotes for this lead.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredUserBudgets.map((b) => {
                        let startingTotal = 0;
                        if (b.quotes && b.quotes.length > 0) {
                          const sortedQ = [...b.quotes].sort((x, y) => (x.grandTotal || 0) - (y.grandTotal || 0));
                          startingTotal = sortedQ[0].grandTotal || 0;
                        }

                        return (
                          <div
                            key={b.docId}
                            className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-xs transition"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="font-black text-gray-900 text-sm">{b.resortName || 'Custom Resort'}</h5>
                                <p className="text-[10px] text-gray-500 font-medium">{b.resortLocation || 'India'}</p>
                              </div>
                              <span className="text-xs font-black text-[#6B0D24]">
                                ₹{formatCurrency(startingTotal)}
                              </span>
                            </div>

                            <div className="flex gap-2 text-[10px] text-gray-500 font-bold">
                              <span className="bg-gray-100 px-2 py-0.5 rounded">👥 {b.guests} Guests</span>
                              <span className="bg-gray-100 px-2 py-0.5 rounded">🌙 {b.days} Days</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={() => setSelectedItemsDrawerQuote(b)}
                                className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              >
                                📋 Items List
                              </button>
                              <button
                                onClick={() => setSelectedQuoteModalQuote(b)}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              >
                                🔍 View Quotes
                              </button>
                              <button
                                onClick={() => handleOpenSalesNotes(b)}
                                className="col-span-2 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 font-bold py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              >
                                📝 View / Add Notes
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= MODE 2: COMPARE ENGINE LOGS ================= */}
        {activeSubTab === 'compare_logs' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">Compare Engine Intent Logs</h3>
                <p className="text-xs text-gray-500">Real-time leads captured from the Multi-Resort Comparison Tool.</p>
              </div>

              <button
                onClick={fetchCompareLogs}
                className="bg-gray-900 text-white font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer"
              >
                🔄 Refresh Logs
              </button>
            </div>

            {loadingCompareLogs ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
                Fetching compare logs...
              </div>
            ) : compareLogs.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-12 text-center">No comparison engine logs found.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Date &amp; Time</th>
                      <th className="p-3.5">Lead / User</th>
                      <th className="p-3.5">Target Resort</th>
                      <th className="p-3.5">Requirements Overview</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                    {compareLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-blue-50/40 transition">
                        <td className="p-3.5">
                          <p className="font-bold text-gray-900">{log.displayDate}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{log.displayTime}</p>
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-gray-900">{log.userName || 'Guest'}</p>
                          <p className="text-[10px] text-green-700 font-mono">{log.userPhone || '--'}</p>
                        </td>
                        <td className="p-3.5 font-bold text-[#6B0D24]">
                          {log.resortClickedName || log.resortName || 'Unknown Venue'}
                        </td>
                        <td className="p-3.5">
                          <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded text-[10px]">
                            👥 {log.guests || '?'} Pax &bull; {log.selectedItems?.length || 0} Items
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => setSelectedLogDetail(log)}
                            className="bg-white border border-gray-200 text-gray-800 hover:border-black font-bold px-3 py-1 rounded-lg text-[10px] transition cursor-pointer"
                          >
                            View Details &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= MODE 3: ALL LIVE ACTIVITY STREAM ================= */}
        {activeSubTab === 'all_activity' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">Live User Activity Stream</h3>
                <p className="text-xs text-gray-500">
                  Real-time activity logs across searches, quote calculations, and resort views.
                </p>
              </div>

              <button
                onClick={fetchAllActivityLogs}
                className="bg-gray-900 text-white font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer"
              >
                🔄 Refresh Stream
              </button>
            </div>

            {loadingAllLogs ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
                Fetching activity stream...
              </div>
            ) : (
              <div className="space-y-3">
                {allActivityLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-stone-50/80 border border-stone-200 p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-900">{log.action || 'Activity'}</span>
                        <span className="bg-gray-200 text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                          {log.page || 'General'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium">
                        User: <strong className="text-gray-800">{log.userName || log.userId || 'Guest'}</strong> &bull;{' '}
                        {log.details || 'No details'}
                      </p>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-gray-400 shrink-0">
                      {log.displayDate} {log.displayTime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: LOG DETAIL MODAL */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl p-6 space-y-4 relative">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-black text-gray-900 text-base">{selectedLogDetail.userName || 'Lead Detail'}</h3>
                <p className="text-xs text-gray-500 font-mono">{selectedLogDetail.userPhone || 'No Phone'}</p>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-gray-400 font-bold text-xs hover:text-black"
              >
                ✖ Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Target Venue</span>
                <p className="font-bold text-gray-900">
                  {selectedLogDetail.resortClickedName || selectedLogDetail.resortName || 'Unknown Venue'}
                </p>
              </div>

              <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                <span className="text-[10px] font-black uppercase text-blue-500 block">Guests &amp; Dates</span>
                <p className="font-bold text-blue-900">
                  {selectedLogDetail.guests || '?'} Guests &bull; {selectedLogDetail.checkInDate || 'Flexible Dates'}
                </p>
              </div>

              <div>
                <h4 className="font-black text-gray-900 mb-2">Decor &amp; Setup Requirements:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {(selectedLogDetail.selectedItems || []).map((item, idx) => (
                    <div key={idx} className="bg-stone-50 border p-2 rounded-lg flex justify-between font-bold">
                      <span className="truncate">{item.name || item.id}</span>
                      <span className="text-[#6B0D24]">x{item.qty || 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SALES NOTES MODAL */}
      {salesNotesQuote && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4 relative">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-base">Sales Notes: {salesNotesQuote.resortName}</h3>
              <button
                onClick={() => setSalesNotesQuote(null)}
                className="text-gray-400 font-bold text-xs hover:text-black"
              >
                ✖ Close
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notesList.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No sales notes yet.</p>
              ) : (
                notesList.map((n) => (
                  <div key={n.id} className="bg-stone-50 border p-3 rounded-xl text-xs space-y-1">
                    <p className="text-gray-800 font-medium">{n.note}</p>
                    <span className="text-[9px] text-gray-400 font-mono block">
                      {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : 'Recent'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Type a new internal note..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-black"
                rows={2}
              />
              <button
                onClick={handleSaveSalesNote}
                disabled={savingNote}
                className="w-full bg-[#6B0D24] text-white font-bold py-2.5 rounded-xl text-xs uppercase transition cursor-pointer disabled:opacity-50"
              >
                {savingNote ? 'Saving...' : 'Save Internal Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ITEMS DRAWER */}
      {selectedItemsDrawerQuote && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 space-y-4 overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-base">
                Selected Items: {selectedItemsDrawerQuote.resortName}
              </h3>
              <button
                onClick={() => setSelectedItemsDrawerQuote(null)}
                className="text-gray-400 font-bold text-xs hover:text-black"
              >
                ✖ Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {(selectedItemsDrawerQuote.selectedItems || []).map((item, idx) => (
                <div key={idx} className="bg-gray-50 border p-3 rounded-xl flex justify-between font-bold">
                  <div>
                    <p className="text-gray-900">{item.name || 'Custom Item'}</p>
                    <p className="text-[9px] text-gray-400 uppercase">{item.category || 'General'}</p>
                  </div>
                  <span className="text-blue-600 font-black">x{item.qty || 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: USER ACTIVITY LOGS MODAL */}
      {userActivityLogsModal && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-6 space-y-4 relative">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-base">User Activity Logs</h3>
              <button
                onClick={() => setUserActivityLogsModal(null)}
                className="text-gray-400 font-bold text-xs hover:text-black"
              >
                ✖ Close
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {userActivityLogsModal.map((log) => (
                <div key={log.id} className="bg-gray-50 border p-3 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-gray-900 block">{log.action || 'Activity'}</span>
                  <p className="text-gray-500 text-[10px]">{log.details || 'No details'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}