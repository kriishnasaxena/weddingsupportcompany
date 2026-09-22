'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AlternateDateOption {
  checkIn: string;
  checkOut: string;
}

interface DayItem {
  id: string;
  label: string;
  unitRate: number;
  qty: number;
  remark?: string;
}

interface QuotationDay {
  dayNumber: number;
  dayOffset?: number;
  dayTitle: string;
  isCustomSection?: boolean;
  items: DayItem[];
}

interface SentQuote {
  id: string;
  resortId: string;
  resortName: string;
  customerName: string;
  customerPhone: string;
  inquiryId?: string;
  checkInDate: string;
  checkOutDate: string;
  paxCount: number;
  dateAvailability?: 'Available' | 'Tentative';
  suggestedAltDates?: AlternateDateOption[];
  days: QuotationDay[];
  rates: Record<string, number>;
  termsAndConditions?: string;
  summary: {
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    perPaxCost: number;
  };
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
  updatedAt: string;
  resortImage?: string;
  resortLocation?: string;
}

interface UserReceivedOffersModuleProps {
  userPhone?: string;
  userName?: string;
}

const DEFAULT_COVER_IMAGE =
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=800';

const formatCurrency = (num: number) => (num ? num.toLocaleString('en-IN') : '0');

// Safe Date Parser
const parseSafeDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback;
};

// Format Date for Input YYYY-MM-DD
const formatDateForInput = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper to extract primary cover image
const extractCoverImageFromDoc = (rd: any): string => {
  if (!rd) return DEFAULT_COVER_IMAGE;

  if (rd.core_images && typeof rd.core_images === 'string') {
    const firstImg = rd.core_images.split(',')[0].trim();
    if (firstImg && firstImg.startsWith('http')) return firstImg;
  }

  if (rd.image && typeof rd.image === 'string') {
    const firstImg = rd.image.split(',')[0].trim();
    if (firstImg && firstImg.startsWith('http')) return firstImg;
  }

  return DEFAULT_COVER_IMAGE;
};

// CALCULATES EXACT STAY LENGTH IN DAYS (DIFFERENCE BETWEEN CHECKOUT AND CHECKIN)
const getInquiredStayDaysCount = (q: SentQuote): number => {
  if (q.checkInDate && q.checkOutDate) {
    const inD = parseSafeDate(q.checkInDate);
    const outD = parseSafeDate(q.checkOutDate);

    if (inD && outD) {
      const diffTime = outD.getTime() - inD.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      if (diffDays > 0) return diffDays;
    }
  }

  // Fallback: Count event days (excluding Day 0 and custom sections)
  if (q.days && q.days.length > 0) {
    const eventDays = q.days.filter((d) => !d.isCustomSection && d.dayNumber > 0).length;
    if (eventDays > 0) return eventDays;
  }

  return 2; // Default 2 days
};

export default function UserReceivedOffersModule({
  userPhone,
  userName,
}: UserReceivedOffersModuleProps) {
  const [offers, setOffers] = useState<SentQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<SentQuote | null>(null);

  // Custom Date Change Inputs State
  const [customInDate, setCustomInDate] = useState<Record<string, string>>({});
  const [customOutDate, setCustomOutDate] = useState<Record<string, string>>({});
  const [updatingDates, setUpdatingDates] = useState(false);

  // Today's Date String for YYYY-MM-DD Input Min Constraint
  const todayStr = useMemo(() => formatDateForInput(new Date()), []);

  // Fetch offers sent to this user
  const fetchUserOffers = async () => {
    if (!userPhone && !userName) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const cleanPhone = (userPhone || '').replace(/[^0-9]/g, '');
      const last10Digits = cleanPhone.slice(-10);

      const snap = await getDocs(collection(db, 'partner_sent_quotes'));
      const list: SentQuote[] = [];

      for (const d of snap.docs) {
        const data = d.data() as SentQuote;
        const phoneClean = (data.customerPhone || '').replace(/[^0-9]/g, '');

        if (
          data.status === 'Sent' ||
          data.status === 'Accepted' ||
          data.status === 'Declined'
        ) {
          if (
            (last10Digits && phoneClean.includes(last10Digits)) ||
            (userName && data.customerName?.toLowerCase().includes(userName.toLowerCase()))
          ) {
            let coverImg = DEFAULT_COVER_IMAGE;
            let loc = 'India';

            if (data.resortId) {
              try {
                const resSnap = await getDoc(doc(db, 'resort_data', data.resortId));
                if (resSnap.exists()) {
                  const rd = resSnap.data();
                  loc = rd.core_location || rd.location || 'India';
                  coverImg = extractCoverImageFromDoc(rd);
                }
              } catch (e) {
                console.error('Error fetching resort details for offer:', e);
              }
            }

            list.push({
  ...data,
  id: d.id,
  resortImage: coverImg,
  resortLocation: loc,
});
          }
        }
      }

      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setOffers(list);
    } catch (err) {
      console.error('Error fetching user offers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserOffers();
  }, [userPhone, userName]);

  // Handle Accept Offer
  const handleAcceptOffer = async (quote: SentQuote) => {
    if (!confirm(`Accept official quotation offer from ${quote.resortName}?`)) return;

    try {
      await setDoc(
        doc(db, 'partner_sent_quotes', quote.id),
        { status: 'Accepted', acceptedAt: new Date().toISOString() },
        { merge: true }
      );

      if (quote.inquiryId) {
        await setDoc(
          doc(db, 'inquiries', quote.inquiryId),
          { status: 'Offer Accepted', offerAccepted: true },
          { merge: true }
        );
      }

      alert(`🎉 Congratulations! You have accepted the quote offer for ${quote.resortName}.`);
      fetchUserOffers();
    } catch (err) {
      console.error('Accept offer error:', err);
      alert('Failed to accept offer.');
    }
  };

  // USER SELECTS ONE OF RESORT PARTNER'S SUGGESTED ALTERNATE DATES
  const handleSelectSuggestedDate = async (quote: SentQuote, alt: AlternateDateOption) => {
    if (!confirm(`Switch your event dates to ${alt.checkIn} - ${alt.checkOut}?`)) return;

    setUpdatingDates(true);
    try {
      await setDoc(
        doc(db, 'partner_sent_quotes', quote.id),
        {
          checkInDate: alt.checkIn,
          checkOutDate: alt.checkOut,
          dateAvailability: 'Available',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      if (quote.inquiryId) {
        await setDoc(
          doc(db, 'inquiries', quote.inquiryId),
          {
            checkInDate: alt.checkIn,
            checkOutDate: alt.checkOut,
            weddingDates: `${alt.checkIn} to ${alt.checkOut}`,
            dateAvailability: 'Available',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      alert(`✅ Dates successfully updated to ${alt.checkIn} - ${alt.checkOut}!`);
      fetchUserOffers();
    } catch (err) {
      console.error('Error updating dates:', err);
      alert('Failed to update dates.');
    } finally {
      setUpdatingDates(false);
    }
  };

  // AUTO-CALCULATES AND LOCKS CHECK-OUT DATE TO MATCH EXACT INQUIRED STAY DURATION
  const handleUserCustomInDateChange = (
    quote: SentQuote,
    newInStr: string
  ) => {
    setCustomInDate((prev) => ({ ...prev, [quote.id]: newInStr }));

    if (newInStr) {
      const inDateObj = parseSafeDate(newInStr);
      if (inDateObj) {
        const stayDays = getInquiredStayDaysCount(quote);
        const autoCheckOutDate = new Date(
          inDateObj.getFullYear(),
          inDateObj.getMonth(),
          inDateObj.getDate() + stayDays
        );
        const autoOutStr = formatDateForInput(autoCheckOutDate);
        setCustomOutDate((prev) => ({ ...prev, [quote.id]: autoOutStr }));
      }
    }
  };

  // USER REQUESTS CUSTOM DATES
  const handleRequestCustomDates = async (quote: SentQuote) => {
    const inD = customInDate[quote.id];
    const outD = customOutDate[quote.id];

    if (!inD || !outD) {
      alert('Please select a new Check-In date before requesting a date change!');
      return;
    }

    const inDateObj = parseSafeDate(inD);
    const todayDateObj = parseSafeDate(todayStr);

    if (!inDateObj || !todayDateObj) {
      alert('Please select a valid Check-In date.');
      return;
    }

    // NO PAST DATES VALIDATION
    if (inDateObj < todayDateObj) {
      alert('Check-In date cannot be in the past! Please select today or a future date.');
      return;
    }

    setUpdatingDates(true);
    try {
      await setDoc(
        doc(db, 'partner_sent_quotes', quote.id),
        {
          checkInDate: inD,
          checkOutDate: outD,
          dateAvailability: 'Tentative',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      if (quote.inquiryId) {
        await setDoc(
          doc(db, 'inquiries', quote.inquiryId),
          {
            checkInDate: inD,
            checkOutDate: outD,
            weddingDates: `${inD} to ${outD}`,
            dateAvailability: 'Tentative',
            userRequestedNewDates: true,
            status: 'New',
            offerSent: false,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      alert(
        `✅ New dates requested (${inD} to ${outD}). The resort partner has been notified to re-confirm!`
      );
      fetchUserOffers();
    } catch (err) {
      console.error('Error requesting date change:', err);
      alert('Failed to request date change.');
    } finally {
      setUpdatingDates(false);
    }
  };

  if (loading || offers.length === 0) return null;

  return (
    <section id="received-offers" className="space-y-6 my-10 font-sans">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-200 pb-3">
        <div>
          <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph-fill ph-tag text-[#6B0D24]"></i> Received Official Offers ({offers.length})
          </h3>
          <p className="text-xs text-gray-500 font-medium">
            Custom quotations sent directly by resort partners in response to your inquiries.
          </p>
        </div>
      </div>

      {/* Offers Carousel / Grid */}
      <div className="flex gap-6 overflow-x-auto pb-6 pt-2 hide-scrollbar snap-x scroll-smooth">
        {offers.map((quote) => {
          const grandTotal = Math.round(quote.summary?.grandTotal || 0);

          // EXACT EVENT DAYS COUNT
          const actualEventDaysCount = (quote.days || []).filter(
            (d) => !d.isCustomSection
          ).length;

          // CALCULATE INITIAL INQUIRED STAY DURATION
          const originalInquiredStayDays = getInquiredStayDaysCount(quote);
          const isTentative = quote.dateAvailability === 'Tentative';

          return (
            <div
              key={quote.id}
              className="shrink-0 w-[310px] sm:w-[360px] bg-white border-2 border-[#6B0D24]/20 hover:border-[#6B0D24] rounded-3xl shadow-md flex flex-col relative overflow-hidden group transition-all duration-300 snap-start"
            >
              {/* Status Badge Tag */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-black shadow-sm border border-gray-200 z-10 flex items-center gap-1.5">
                {quote.status === 'Accepted' ? (
                  <span className="text-blue-600 flex items-center gap-1">
                    <i className="ph-bold ph-check-circle text-base"></i> Offer Accepted
                  </span>
                ) : (
                  <span className="text-[#6B0D24] flex items-center gap-1">
                    <i className="ph-fill ph-sparkle text-[#C5A059]"></i> Official Offer
                  </span>
                )}
              </div>

              {/* Cover Image & Resort Header */}
              <div className="relative h-60 w-full block bg-gray-100 overflow-hidden">
                <img
                  src={quote.resortImage}
                  alt={quote.resortName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-900/30 to-transparent"></div>

                {/* Location Badge */}
                <div className="absolute top-14 left-4 bg-black/40 backdrop-blur-md text-white px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm z-10 border border-white/10">
                  <i className="ph-fill ph-map-pin text-[#C5A059]"></i>
                  <span>{quote.resortLocation || 'India'}</span>
                </div>

                {/* Resort Name Header */}
                <div className="absolute bottom-0 left-0 w-full p-4 md:p-5 z-10">
                  <h4 className="text-lg md:text-xl font-black text-white leading-tight break-words drop-shadow-sm">
                    {quote.resortName}
                  </h4>
                </div>
              </div>

              {/* Card Body Details */}
              <div className="p-6 flex-1 flex flex-col space-y-4">
                <div className="flex items-center gap-2 text-xs text-gray-600 font-bold flex-wrap">
                  <span className="bg-stone-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                    <i className="ph-fill ph-users text-[#6B0D24] text-base"></i> {quote.paxCount} Pax
                  </span>
                  <span className="bg-stone-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                    <i className="ph-fill ph-calendar text-[#6B0D24] text-base"></i> {actualEventDaysCount}{' '}
                    {actualEventDaysCount === 1 ? 'Day' : 'Days'}
                  </span>
                </div>

                {/* DATES AVAILABILITY BADGE & RESOLUTION SECTION */}
                <div className="space-y-2">
                  <div
                    className={`p-3 rounded-2xl border text-xs font-bold flex justify-between items-center ${
                      isTentative
                        ? 'bg-red-50 border-red-200 text-red-950'
                        : 'bg-green-50 border-green-200 text-green-950'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-black uppercase block tracking-wider opacity-70">
                        Date Availability Status
                      </span>
                      <span>
                        {isTentative
                          ? '🔴 Dates Tentative / Sold Out'
                          : '🟢 Dates Confirmed Available'}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono font-bold">
                      {quote.checkInDate || 'TBD'}
                    </span>
                  </div>

                  {/* IF DATES ARE TENTATIVE: SHOW SUGGESTED ALTERNATES & CUSTOM DATE REQUEST */}
                  {isTentative && (
                    <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-2xl space-y-2.5 text-xs">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block">
                        📅 Resort Partner Suggested Alternate Dates:
                      </span>

                      {quote.suggestedAltDates && quote.suggestedAltDates.length > 0 ? (
                        <div className="space-y-1.5">
                          {quote.suggestedAltDates.map((alt, aIdx) => (
                            <div
                              key={aIdx}
                              className="bg-white border border-amber-200 p-2 rounded-xl flex justify-between items-center text-xs"
                            >
                              <span className="font-bold text-gray-800">
                                {alt.checkIn} &rarr; {alt.checkOut}
                              </span>
                              <button
                                onClick={() => handleSelectSuggestedDate(quote, alt)}
                                disabled={updatingDates}
                                className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-bold px-2.5 py-1 rounded-lg text-[10px] cursor-pointer"
                              >
                                Accept Date
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-800 italic">
                          No alternate dates suggested yet. Propose your preferred dates below:
                        </p>
                      )}

                      {/* REQUEST CUSTOM DATE CHANGE INPUTS (AUTO-LOCKED TO INQUIRED DURATION) */}
                      <div className="pt-2 border-t border-amber-200 space-y-1.5">
                        <span className="text-[10px] font-bold text-amber-900 block">
                          Or Request Custom Dates ({originalInquiredStayDays} Days Stay):
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[8px] font-bold text-amber-800 uppercase mb-0.5">
                              Check-In Date
                            </label>
                            <input
                              type="date"
                              min={todayStr}
                              value={customInDate[quote.id] || ''}
                              onChange={(e) =>
                                handleUserCustomInDateChange(
                                  quote,
                                  e.target.value
                                )
                              }
                              className="bg-white border border-amber-300 rounded-lg p-1 text-[10px] font-bold w-full outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[8px] font-bold text-amber-800 uppercase mb-0.5">
                              Check-Out (Auto Locked)
                            </label>
                            <input
                              type="date"
                              value={customOutDate[quote.id] || ''}
                              disabled
                              className="bg-stone-100 border border-stone-200 rounded-lg p-1 text-[10px] font-bold w-full text-stone-500 cursor-not-allowed"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => handleRequestCustomDates(quote)}
                          disabled={updatingDates}
                          className="w-full bg-stone-900 hover:bg-black text-white font-bold py-1.5 rounded-lg text-[10px] uppercase cursor-pointer"
                        >
                          Request New Dates
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grand Total Box */}
                <div className="mt-auto bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-150">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-0.5">
                      Offered Grand Total
                    </p>
                    <p className="text-2xl font-black text-[#6B0D24]">
                      ₹ {formatCurrency(grandTotal)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase">Average / Guest</span>
                    <span className="text-xs font-black text-gray-700 font-mono">
                      ₹{formatCurrency(Math.round(quote.summary?.perPaxCost || 0))}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 w-full pt-1">
                  <button
                    onClick={() => setSelectedQuote(quote)}
                    className="bg-white hover:bg-stone-50 text-gray-800 border border-gray-200 font-bold py-2.5 rounded-xl text-xs transition flex justify-center items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    🔍 Inspect Quote
                  </button>

                  {quote.status !== 'Accepted' ? (
                    <button
                      onClick={() => handleAcceptOffer(quote)}
                      className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-2.5 rounded-xl text-xs transition flex justify-center items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      Accept Offer
                    </button>
                  ) : (
                    <button
                      disabled
                      className="bg-blue-50 text-blue-800 font-bold py-2.5 rounded-xl text-xs cursor-default flex justify-center items-center gap-1"
                    >
                      ✓ Accepted
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FULL QUOTE BREAKDOWN MODAL */}
      {selectedQuote && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            <header className="p-4 bg-gray-50 border-b flex justify-between items-center print:hidden">
              <span className="font-black text-xs text-gray-900 uppercase tracking-wider">
                📄 Official Resort Quotation Breakdown
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
                >
                  🖨️ Print / Save PDF
                </button>
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="bg-gray-200 text-gray-700 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  ✖ Close
                </button>
              </div>
            </header>

            <div className="p-8 space-y-6 overflow-y-auto flex-1 font-sans text-gray-900 print:p-0">
              {/* BRANDED HEADER */}
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h2 className="text-xl font-black text-[#6B0D24]">{selectedQuote.resortName}</h2>
                  <p className="text-xs text-gray-500 font-bold mt-1">
                    Event Dates: {selectedQuote.checkInDate || 'TBD'} &rarr; {selectedQuote.checkOutDate || 'TBD'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-[#6B0D24] font-mono text-lg block">
                    ₹{formatCurrency(Math.round(selectedQuote.summary?.grandTotal || 0))}
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold">{selectedQuote.paxCount} Pax</span>
                </div>
              </div>

              {/* ITINERARY DAYS BREAKDOWN WITH PARAMETER REMARKS */}
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 border-b pb-1">
                  Itemized Event Services &amp; Stay Breakdown
                </h4>

                {(selectedQuote.days || []).map((day, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-2xl p-4 space-y-2">
                    <h5 className="font-black text-xs text-[#6B0D24]">{day.dayTitle}</h5>
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] font-bold text-gray-400 uppercase">
                        <tr>
                          <th className="pb-1">Service / Parameter &amp; Remarks</th>
                          <th className="pb-1 text-center">Qty</th>
                          <th className="pb-1 text-right">Rate</th>
                          <th className="pb-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {day.items.map((item) => (
                          <tr key={item.id}>
                            <td className="py-2">
                              <span className="font-bold text-gray-800 block">{item.label}</span>
                              {item.remark && (
                                <span className="text-[10px] text-gray-500 italic block font-sans">
                                  Note: {item.remark}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-center font-mono">{item.qty}</td>
                            <td className="py-2 text-right font-mono">₹{formatCurrency(item.unitRate)}</td>
                            <td className="py-2 text-right font-mono font-bold text-gray-900">
                              ₹{formatCurrency(item.unitRate * item.qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* TOTALS */}
              <div className="bg-stone-900 text-white p-5 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold">
                    ₹{formatCurrency(selectedQuote.summary?.subtotal || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>GST / Taxes ({selectedQuote.rates?.taxPercentage || 18}%)</span>
                  <span className="font-mono font-bold">
                    ₹{formatCurrency(selectedQuote.summary?.taxAmount || 0)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-stone-800 pt-2 text-sm font-black text-white">
                  <span>Grand Total</span>
                  <span className="font-mono text-amber-400">
                    ₹{formatCurrency(Math.round(selectedQuote.summary?.grandTotal || 0))}
                  </span>
                </div>
              </div>

              {/* DYNAMIC RESORT TERMS & CONDITIONS */}
              {selectedQuote.termsAndConditions && (
                <div className="text-[10px] text-gray-500 space-y-1 pt-4 border-t whitespace-pre-line leading-relaxed">
                  <p className="font-black uppercase text-gray-700 text-[11px]">Resort Terms &amp; Conditions:</p>
                  <p>{selectedQuote.termsAndConditions}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}