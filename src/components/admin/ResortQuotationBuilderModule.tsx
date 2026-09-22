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
  addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ResortOption {
  id: string;
  name: string;
  location: string;
  rooms: number;
}

interface MasterRates {
  doubleRoomRate: number;
  extraBedRate: number;
  extraBreakfastRate: number;
  regularLunchRate: number;
  regularDinnerRate: number;
  hiTeaRate: number;
  semiGalaRate: number;
  galaDinnerRate: number;
  corkageCharges: number;
  liquorLicenceRate: number;
  taxPercentage: number;
  [key: string]: number;
}

interface CustomParamMeta {
  key: string;
  label: string;
  unitRate: number;
  defaultRemark?: string;
}

interface DayItem {
  id: string;
  key: string;
  label: string;
  unitRate: number;
  qty: number;
  remark?: string;
  isLumpSum?: boolean;
}

interface QuotationDay {
  dayNumber: number;
  dayOffset?: number;
  dayTitle: string;
  isCustomSection?: boolean;
  items: DayItem[];
}

interface AlternateDateOption {
  checkIn: string;
  checkOut: string;
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
  rates: MasterRates;
  parameterRemarks?: Record<string, string>;
  customParamsMeta?: CustomParamMeta[];
  termsAndConditions?: string;
  summary: {
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    perPaxCost: number;
  };
  status: 'Draft' | 'Sent' | 'Accepted' | 'Declined';
  updatedAt: string;
}

interface ResortInquiry {
  id: string;
  userName?: string;
  name?: string;
  customerName?: string;
  userPhone?: string;
  phone?: string;
  customerPhone?: string;
  weddingDates?: string;
  weddingDate?: string;
  date?: string;
  checkInDate?: string;
  checkOutDate?: string;
  guests?: string | number;
  pax?: string | number;
  guestCount?: string | number;
  resortId?: string;
  resortName?: string;
  status?: string;
  submittedAt?: any;
  timestamp?: any;
  offerSent?: boolean;
  offerQuoteId?: string;
  dateAvailability?: 'Available' | 'Tentative';
  userRequestedNewDates?: boolean;
}

const formatCurrency = (num: number) => (num ? num.toLocaleString('en-IN') : '0');

// SAFE DATE PARSER
const parseSafeDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  if (clean.includes('/')) {
    const parts = clean.split('/').map(Number);
    if (parts.length === 3) {
      if (parts[0] > 1000) return new Date(parts[0], parts[1] - 1, parts[2]);
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }

  const fallback = new Date(clean);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const formatDateForInput = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const shiftDateString = (dateStr: string, daysShift: number): string => {
  const d = parseSafeDate(dateStr);
  if (!d) return dateStr;
  const newD = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysShift);
  return formatDateForInput(newD);
};

const DEFAULT_RATES: MasterRates = {
  doubleRoomRate: 12000,
  extraBedRate: 2500,
  extraBreakfastRate: 750,
  regularLunchRate: 1200,
  regularDinnerRate: 1500,
  hiTeaRate: 600,
  semiGalaRate: 2200,
  galaDinnerRate: 3500,
  corkageCharges: 15000,
  liquorLicenceRate: 25000,
  taxPercentage: 18,
};

const DEFAULT_TERMS = `1. Check-In: 12:00 PM | Check-Out: 10:00 AM. Early check-in subject to room availability.
2. Advance deposit of 50% required to lock dates and inventory rooms.
3. Liquor licence charges & corkage subject to government guidelines and venue policies.
4. Final guest count and meal parameters must be confirmed 7 days prior to check-in.`;

const PRECREATED_PARAMETERS = [
  { key: 'doubleRoomRate', label: 'Room Cost (Double Occupancy + Breakfast)', defaultType: 'room' },
  { key: 'extraBedRate', label: 'Extra Bed Cost', defaultType: 'extra' },
  { key: 'extraBreakfastRate', label: 'Extra Breakfast Cost', defaultType: 'extra' },
  { key: 'regularLunchRate', label: 'Regular Lunch', defaultType: 'pax' },
  { key: 'regularDinnerRate', label: 'Regular Dinner', defaultType: 'pax' },
  { key: 'hiTeaRate', label: 'Welcome Hi-Tea', defaultType: 'pax' },
  { key: 'semiGalaRate', label: 'Semi Gala Dinner / Lunch', defaultType: 'pax' },
  { key: 'galaDinnerRate', label: 'Gala Dinner / Lunch', defaultType: 'pax' },
  { key: 'corkageCharges', label: 'Corkage Charges', defaultType: 'fixed' },
  { key: 'liquorLicenceRate', label: 'Liquor Licence Charges', defaultType: 'fixed' },
];

interface ResortQuotationBuilderModuleProps {
  resortId?: string;
  targetInquiryId?: string;
}

export default function ResortQuotationBuilderModule({
  resortId: partnerResortId,
  targetInquiryId,
}: ResortQuotationBuilderModuleProps) {
  const [activeTabMode, setActiveTabMode] = useState<'builder' | 'directory'>('builder');

  const [resorts, setResorts] = useState<ResortOption[]>([]);
  const [selectedResortId, setSelectedResortId] = useState<string>(partnerResortId || '');
  const [loadingResorts, setLoadingResorts] = useState(true);

  // Inquiries for this resort
  const [inquiries, setInquiries] = useState<ResortInquiry[]>([]);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string>('');
  const [isUserRequestedDates, setIsUserRequestedDates] = useState(false);

  // DATE AVAILABILITY STATUS & ALTERNATE DATES MODAL
  const [dateAvailability, setDateAvailability] = useState<'Available' | 'Tentative' | ''>('');
  const [altDatesModalOpen, setAltDatesModalOpen] = useState(false);
  const [suggestedAltDates, setSuggestedAltDates] = useState<AlternateDateOption[]>([
    { checkIn: '', checkOut: '' },
  ]);

  // SMART DATE EXTENSION POPUP MODAL STATE
  const [dateExtensionModalOpen, setDateExtensionModalOpen] = useState(false);

  // Customer & Event Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [paxCount, setPaxCount] = useState<number>(200);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  // Master Rate Card, Remarks & Terms
  const [rates, setRates] = useState<MasterRates>(DEFAULT_RATES);
  const [parameterRemarks, setParameterRemarks] = useState<Record<string, string>>({});
  const [customParamsMeta, setCustomParamsMeta] = useState<CustomParamMeta[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState<string>(DEFAULT_TERMS);
  const [savingRates, setSavingRates] = useState(false);

  // Itinerary Days
  const [days, setDays] = useState<QuotationDay[]>([]);

  // Directory of Sent Quotes
  const [sentQuotes, setSentQuotes] = useState<SentQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);

  // Client Filter in Directory
  const [selectedClientPhone, setSelectedClientPhone] = useState<string | null>(null);

  // PDF Modal Preview State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const todayStr = useMemo(() => formatDateForInput(new Date()), []);

  // --- FETCH RESORTS ---
  useEffect(() => {
    const fetchResorts = async () => {
      setLoadingResorts(true);
      try {
        if (partnerResortId) {
          const snap = await getDoc(doc(db, 'resort_data', partnerResortId));
          if (snap.exists()) {
            const data = snap.data();
            const singleResort: ResortOption = {
              id: snap.id,
              name: data._recordName || data.core_name || data.name || 'Assigned Resort',
              location: data.core_location || data.location || 'India',
              rooms: Number(data.core_rooms || data.rooms || 50),
            };
            setResorts([singleResort]);
            setSelectedResortId(snap.id);
          }
        } else {
          const snap = await getDocs(collection(db, 'resort_data'));
          const list: ResortOption[] = [];
          snap.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              name: data._recordName || data.core_name || data.name || 'Unnamed Resort',
              location: data.core_location || data.location || 'India',
              rooms: Number(data.core_rooms || data.rooms || 50),
            });
          });
          list.sort((a, b) => a.name.localeCompare(b.name));
          setResorts(list);
          if (list.length > 0 && !selectedResortId) {
            setSelectedResortId(list[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching resorts:', err);
      } finally {
        setLoadingResorts(false);
      }
    };
    fetchResorts();
  }, [partnerResortId]);

  // Selected Resort Object
  const selectedResort = useMemo(() => {
    return resorts.find((r) => r.id === selectedResortId) || null;
  }, [resorts, selectedResortId]);

  // --- FETCH INQUIRIES & SENT QUOTES ---
  const fetchResortInquiriesAndQuotes = async (resortIdToFetch: string) => {
    if (!resortIdToFetch) return;

    try {
      const inqList: ResortInquiry[] = [];

      const snapInq = await getDocs(collection(db, 'inquiries'));
      snapInq.forEach((d) => {
        const data = d.data() as ResortInquiry;
        if (data.resortId === resortIdToFetch || (data as any).resort_id === resortIdToFetch) {
          inqList.push({ ...data, id: d.id });
        }
      });

      setInquiries(inqList);

      const qQuotes = query(
        collection(db, 'partner_sent_quotes'),
        where('resortId', '==', resortIdToFetch)
      );
      const snapQuotes = await getDocs(qQuotes);
      const quoteList: SentQuote[] = [];
      snapQuotes.forEach((d) => {
        quoteList.push({ id: d.id, ...d.data() } as SentQuote);
      });
      quoteList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSentQuotes(quoteList);

      const rateSnap = await getDoc(doc(db, 'resort_quotation_ratecards', `ratecard_${resortIdToFetch}`));
      if (rateSnap.exists()) {
        const data = rateSnap.data();
        if (data.rates) setRates(data.rates);
        if (data.parameterRemarks) setParameterRemarks(data.parameterRemarks);
        if (data.customParamsMeta) setCustomParamsMeta(data.customParamsMeta);
        if (data.termsAndConditions) setTermsAndConditions(data.termsAndConditions);
      } else {
        setRates(DEFAULT_RATES);
        setParameterRemarks({});
        setCustomParamsMeta([]);
        setTermsAndConditions(DEFAULT_TERMS);
      }

      const targetInqId = targetInquiryId || localStorage.getItem('wsc_target_quote_inquiry_id');
      if (targetInqId) {
        handleSelectInquiryToRevert(targetInqId, inqList, quoteList);
        localStorage.removeItem('wsc_target_quote_inquiry_id');
      }
    } catch (err) {
      console.error('Error fetching resort data:', err);
    }
  };

  useEffect(() => {
    if (!selectedResortId) return;

    fetchResortInquiriesAndQuotes(selectedResortId);

    const intervalId = setInterval(() => {
      fetchResortInquiriesAndQuotes(selectedResortId);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [selectedResortId]);

  // LISTEN TO CRM REDIRECTION EVENT
  useEffect(() => {
    const handleOpenQuoteForLeadEvent = (event: any) => {
      const inqId = event.detail?.inquiryId || localStorage.getItem('wsc_target_quote_inquiry_id');
      if (inqId) {
        handleSelectInquiryToRevert(inqId, inquiries, sentQuotes);
        localStorage.removeItem('wsc_target_quote_inquiry_id');
      }
    };

    window.addEventListener('open_quote_builder_for_lead', handleOpenQuoteForLeadEvent);
    return () => window.removeEventListener('open_quote_builder_for_lead', handleOpenQuoteForLeadEvent);
  }, [inquiries, sentQuotes]);

  // --- AUTOMATED PAX MATH ---
  const resortRoomsCount = selectedResort?.rooms || 50;
  const doubleOccupancyCapacity = resortRoomsCount * 2;
  const roomsNeeded = Math.min(resortRoomsCount, Math.ceil(paxCount / 2));
  const extraGuestsCount = Math.max(0, paxCount - roomsNeeded * 2);

  // DYNAMIC MAX NIGHTS ALLOWED (RE-CALCULATES ACCURATELY ON ANY DATE CHANGE)
  const maxNightsAllowed = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 100;
    const inD = parseSafeDate(checkInDate);
    const outD = parseSafeDate(checkOutDate);
    if (!inD || !outD) return 100;

    const diffTime = outD.getTime() - inD.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
    return diffDays > 0 ? diffDays : 1;
  }, [checkInDate, checkOutDate]);

  const eventDaysCount = useMemo(() => {
    return days.filter((d) => !d.isCustomSection && d.dayNumber > 0).length;
  }, [days]);

  const customSectionsCount = useMemo(() => {
    return days.filter((d) => d.isCustomSection).length;
  }, [days]);

  const calculationSummary = useMemo(() => {
    let subtotal = 0;
    days.forEach((d) => {
      d.items.forEach((item) => {
        subtotal += item.unitRate * item.qty;
      });
    });

    const taxAmount = (subtotal * (rates.taxPercentage || 18)) / 100;
    const grandTotal = subtotal + taxAmount;
    const perPaxCost = paxCount > 0 ? grandTotal / paxCount : 0;

    return {
      subtotal,
      taxAmount,
      grandTotal,
      perPaxCost,
    };
  }, [days, rates.taxPercentage, paxCount]);

  const pendingInquiries = useMemo(() => {
    return inquiries.filter((i) => !i.offerSent && i.status !== 'Offer Sent');
  }, [inquiries]);

  const clientGroupedQuotes = useMemo(() => {
    const map = new Map<string, { clientName: string; clientPhone: string; quotes: SentQuote[] }>();

    sentQuotes.forEach((q) => {
      const key = q.customerPhone.trim() || q.customerName.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          clientName: q.customerName,
          clientPhone: q.customerPhone,
          quotes: [],
        });
      }
      map.get(key)!.quotes.push(q);
    });

    return Array.from(map.values());
  }, [sentQuotes]);

  // --- PRE-FILL FROM INQUIRY ---
  const handleSelectInquiryToRevert = (
    inquiryId: string,
    currentInquiries = inquiries,
    currentQuotes = sentQuotes
  ) => {
    setSelectedInquiryId(inquiryId);
    if (!inquiryId) return;

    const inq = currentInquiries.find((i) => i.id === inquiryId);
    if (inq) {
      setCustomerName(inq.customerName || inq.userName || inq.name || '');

      const phoneVal = inq.customerPhone || inq.userPhone || inq.phone || '';
      setCustomerPhone(phoneVal);

      const rawGuests = inq.guests || inq.pax || inq.guestCount || 200;
      const parsedPax = typeof rawGuests === 'number' ? rawGuests : parseInt(String(rawGuests)) || 200;
      setPaxCount(parsedPax);

      let parsedInDate: Date | null = null;
      let parsedOutDate: Date | null = null;

      if (inq.weddingDates && inq.weddingDates.includes(' to ')) {
        const dateParts = inq.weddingDates.split(' to ');
        parsedInDate = parseSafeDate(dateParts[0]);
        parsedOutDate = parseSafeDate(dateParts[1]);
      } else if (inq.weddingDate) {
        parsedInDate = parseSafeDate(inq.weddingDate);
        parsedOutDate = parseSafeDate(inq.weddingDate);
      } else if (inq.date) {
        parsedInDate = parseSafeDate(inq.date);
        parsedOutDate = parseSafeDate(inq.date);
      } else if (inq.checkInDate) {
        parsedInDate = parseSafeDate(inq.checkInDate);
        parsedOutDate = parseSafeDate(inq.checkOutDate || inq.checkInDate);
      }

      setCheckInDate(formatDateForInput(parsedInDate));
      setCheckOutDate(formatDateForInput(parsedOutDate));

      setDateAvailability(inq.dateAvailability || '');
      setIsUserRequestedDates(!!inq.userRequestedNewDates || inq.status === 'New');

      const existingQuote = currentQuotes.find(
        (q) =>
          q.inquiryId === inquiryId ||
          (inq.offerQuoteId && q.id === inq.offerQuoteId) ||
          (q.customerPhone && phoneVal && q.customerPhone === phoneVal)
      );

      if (existingQuote) {
        setEditingQuoteId(existingQuote.id);
        setDays(existingQuote.days || []);
        if (existingQuote.rates) setRates(existingQuote.rates);
        if (existingQuote.parameterRemarks) setParameterRemarks(existingQuote.parameterRemarks);
        if (existingQuote.dateAvailability) setDateAvailability(existingQuote.dateAvailability);
      } else {
        setEditingQuoteId(null);
        setDays([]);
      }

      setActiveTabMode('builder');
    }
  };

  const handleSaveRateCard = async () => {
    if (!selectedResortId) return;
    setSavingRates(true);
    try {
      await setDoc(doc(db, 'resort_quotation_ratecards', `ratecard_${selectedResortId}`), {
        resortId: selectedResortId,
        resortName: selectedResort?.name || 'Resort',
        rates: rates,
        parameterRemarks: parameterRemarks,
        customParamsMeta: customParamsMeta,
        termsAndConditions: termsAndConditions,
        updatedAt: new Date().toISOString(),
      });
      alert('✅ Master Rate Card, Remarks & T&Cs saved live to Firebase!');
    } catch (err: any) {
      console.error('Error saving rate card:', err);
      alert('Failed to save rate card: ' + err.message);
    } finally {
      setSavingRates(false);
    }
  };

  const handleCreateCustomParameter = () => {
    const label = prompt('Enter Custom Parameter Name (e.g. DJ & Sound Setup, Floral Mandap Decor):');
    if (!label || !label.trim()) return;

    const rateStr = prompt(`Enter Unit Rate in Rupees (₹) for "${label.trim()}":`, '5000');
    const unitRate = Number(rateStr) || 0;

    const defaultNote = prompt(`Optional default remark/description for "${label.trim()}":`, '') || '';

    const key = `custom_${Date.now()}`;
    const newMeta: CustomParamMeta = {
      key: key,
      label: label.trim(),
      unitRate: unitRate,
      defaultRemark: defaultNote.trim(),
    };

    setCustomParamsMeta([...customParamsMeta, newMeta]);
    setRates({ ...rates, [key]: unitRate });
    if (defaultNote.trim()) {
      setParameterRemarks({ ...parameterRemarks, [key]: defaultNote.trim() });
    }

    alert(`✅ Custom parameter "${label.trim()}" created!`);
  };

  // --- SAVE OR SEND OFFER / QUOTE ---
  const handleSaveOrSendQuote = async (status: 'Sent' | 'Draft') => {
    if (!selectedResortId) {
      alert('Please select a resort.');
      return;
    }
    if (!customerName.trim()) {
      alert('Please enter Customer / Lead Name.');
      return;
    }
    if (days.length === 0) {
      alert('Please add at least 1 day with parameters to build a quotation.');
      return;
    }

    if (status === 'Sent' && !dateAvailability) {
      alert(
        '⚠️ MANDATORY ACTION REQUIRED:\n\nPlease confirm whether the requested event dates are "Available" or "Tentative" before sending the offer!'
      );
      return;
    }

    setSavingQuote(true);
    const quoteDocId = editingQuoteId || `quote_${Date.now()}`;

    const quotePayload: SentQuote = {
      id: quoteDocId,
      resortId: selectedResortId,
      resortName: selectedResort?.name || 'Resort',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      inquiryId: selectedInquiryId || '',
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      paxCount: paxCount,
      dateAvailability: dateAvailability || 'Available',
      suggestedAltDates: suggestedAltDates.filter((a) => a.checkIn && a.checkOut),
      days: days,
      rates: rates,
      parameterRemarks: parameterRemarks,
      customParamsMeta: customParamsMeta,
      termsAndConditions: termsAndConditions,
      summary: calculationSummary,
      status: status,
      updatedAt: new Date().toISOString(),
    };

    try {
      try {
        await setDoc(doc(db, 'partner_sent_quotes', quoteDocId), quotePayload);
      } catch (e) {
        await addDoc(collection(db, 'partner_sent_quotes'), quotePayload);
      }

      if (selectedInquiryId) {
        try {
          await setDoc(
            doc(db, 'inquiries', selectedInquiryId),
            {
              status: 'Offer Sent',
              offerSent: true,
              offerQuoteId: quoteDocId,
              offerGrandTotal: calculationSummary.grandTotal,
              dateAvailability: dateAvailability || 'Available',
              userRequestedNewDates: false, // Reset user requested flag upon send
              suggestedAltDates: suggestedAltDates.filter((a) => a.checkIn && a.checkOut),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (inqErr) {
          console.warn('Could not update inquiry doc status directly:', inqErr);
        }
      }

      alert(
        status === 'Sent'
          ? `✅ Offer successfully sent for ${customerName}! Date Status: [${dateAvailability || 'Available'}]`
          : `✅ Quote saved as Draft!`
      );

      if (status === 'Sent' && customerPhone.trim()) {
        const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
        const message = `Hi ${customerName}, ${selectedResort?.name || 'our resort'} has created an official quotation for your event (${paxCount} Guests, ${days.length} Sections/Days).\n\n📅 Event Dates: ${checkInDate || 'TBD'} to ${checkOutDate || 'TBD'} [Status: ${dateAvailability}]\n💰 *Estimated Grand Total:* ₹${formatCurrency(Math.round(calculationSummary.grandTotal))}\n📊 *Average Per Guest:* ₹${formatCurrency(Math.round(calculationSummary.perPaxCost))}/person\n\nLet us know if you'd like to adjust any event parameters!`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
      }

      await fetchResortInquiriesAndQuotes(selectedResortId);
      setActiveTabMode('directory');
    } catch (err: any) {
      console.error('Save quote error:', err);
      alert('Failed to save quote: ' + (err.message || 'Please check permissions.'));
    } finally {
      setSavingQuote(false);
    }
  };

  const handleEditQuote = (quote: SentQuote) => {
    setEditingQuoteId(quote.id);
    setSelectedInquiryId(quote.inquiryId || '');
    setCustomerName(quote.customerName || '');
    setCustomerPhone(quote.customerPhone || '');
    setCheckInDate(quote.checkInDate || '');
    setCheckOutDate(quote.checkOutDate || '');
    setPaxCount(quote.paxCount || 200);
    setDateAvailability(quote.dateAvailability || '');
    if (quote.suggestedAltDates) setSuggestedAltDates(quote.suggestedAltDates);
    setDays(quote.days || []);
    setRates(quote.rates || DEFAULT_RATES);
    if (quote.parameterRemarks) setParameterRemarks(quote.parameterRemarks);
    if (quote.customParamsMeta) setCustomParamsMeta(quote.customParamsMeta);
    if (quote.termsAndConditions) setTermsAndConditions(quote.termsAndConditions);
    setActiveTabMode('builder');
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quotation?')) return;
    try {
      await deleteDoc(doc(db, 'partner_sent_quotes', quoteId));
      fetchResortInquiriesAndQuotes(selectedResortId);
    } catch (err) {
      console.error('Delete quote error:', err);
      alert('Failed to delete quote.');
    }
  };

  const handleStartBlankQuote = () => {
    setEditingQuoteId(null);
    setSelectedInquiryId('');
    setCustomerName('');
    setCustomerPhone('');
    setCheckInDate('');
    setCheckOutDate('');
    setPaxCount(200);
    setDateAvailability('');
    setIsUserRequestedDates(false);
    setDays([]);
    setActiveTabMode('builder');
  };

  // --- DAY MANAGERS (DAY 0 EXCLUDED FROM EVENT DAY LIMITS) ---
  const handleAddDayZero = () => {
    if (days.some((d) => d.dayNumber === 0)) {
      alert('Day 0 (Pre-arrival day) is already added!');
      return;
    }

    const minOffset = days.length > 0 ? Math.min(...days.map((d) => d.dayOffset ?? 0)) : 0;
    const dayZeroOffset = minOffset - 1;

    const dayZero: QuotationDay = {
      dayNumber: 0,
      dayOffset: dayZeroOffset,
      dayTitle: 'Day 0 - Pre-Arrival / Pre-Wedding',
      items: [], // CLEAN CANVAS
    };

    setDays([dayZero, ...days]);
  };

  const handleAddDay = () => {
    // ENFORCE STRICT EVENT DURATION LIMIT (EXCLUDES DAY 0 AND CUSTOM SECTIONS)
    if (selectedInquiryId && checkInDate && checkOutDate && eventDaysCount >= maxNightsAllowed) {
      setDateExtensionModalOpen(true);
      return;
    }

    const maxOffset = days.length > 0 ? Math.max(...days.map((d) => d.dayOffset ?? 0)) : -1;
    const newOffset = maxOffset + 1;
    const newDayNum = eventDaysCount + 1;

    setDays([
      ...days,
      {
        dayNumber: newDayNum,
        dayOffset: newOffset,
        dayTitle: `Day ${newDayNum} - Event & Stay`,
        items: [], // CLEAN CANVAS
      },
    ]);
  };

  // SMART DATE EXTENSION ACTIONS
  const handleExtendCheckInDateAndAddDay = () => {
    if (checkInDate) {
      const newInDate = shiftDateString(checkInDate, -1);
      setCheckInDate(newInDate);
    }

    const maxOffset = days.length > 0 ? Math.max(...days.map((d) => d.dayOffset ?? 0)) : -1;
    const newOffset = maxOffset + 1;
    const newDayNum = eventDaysCount + 1;

    setDays([
      ...days,
      {
        dayNumber: newDayNum,
        dayOffset: newOffset,
        dayTitle: `Day ${newDayNum} - Event & Stay`,
        items: [],
      },
    ]);

    setDateExtensionModalOpen(false);
  };

  const handleExtendCheckOutDateAndAddDay = () => {
    if (checkOutDate) {
      const newOutDate = shiftDateString(checkOutDate, 1);
      setCheckOutDate(newOutDate);
    }

    const maxOffset = days.length > 0 ? Math.max(...days.map((d) => d.dayOffset ?? 0)) : -1;
    const newOffset = maxOffset + 1;
    const newDayNum = eventDaysCount + 1;

    setDays([
      ...days,
      {
        dayNumber: newDayNum,
        dayOffset: newOffset,
        dayTitle: `Day ${newDayNum} - Event & Stay`,
        items: [],
      },
    ]);

    setDateExtensionModalOpen(false);
  };

  const handleAddCustomSection = () => {
    const title = prompt('Enter Custom Section Title (e.g. Vendor Charges, Mandap & Decor, DJ Setup):');
    if (!title || !title.trim()) return;

    const newSection: QuotationDay = {
      dayNumber: 99,
      dayOffset: 0,
      dayTitle: title.trim(),
      isCustomSection: true,
      items: [],
    };

    setDays([...days, newSection]);
  };

  const handleRemoveDay = (dayIdx: number) => {
    const updated = days.filter((_, idx) => idx !== dayIdx);
    setDays(updated);
  };

  const handleAddItemToDay = (dayIdx: number, paramKey: string) => {
    if (paramKey === 'CREATE_CUSTOM') {
      handleCreateCustomParameter();
      return;
    }

    const preParam = PRECREATED_PARAMETERS.find((p) => p.key === paramKey);
    const customParam = customParamsMeta.find((cp) => cp.key === paramKey);

    const label = preParam?.label || customParam?.label || 'Custom Service';
    const unitRate = rates[paramKey] || customParam?.unitRate || 0;
    const defaultRemark = parameterRemarks[paramKey] || customParam?.defaultRemark || '';

    let defaultQty = paxCount;
    if (preParam) {
      if (preParam.defaultType === 'room') defaultQty = roomsNeeded;
      if (preParam.defaultType === 'extra') defaultQty = extraGuestsCount;
      if (preParam.defaultType === 'fixed') defaultQty = 1;
    }

    const newItem: DayItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      key: paramKey,
      label: label,
      unitRate: unitRate,
      qty: defaultQty,
      remark: defaultRemark,
    };

    const updated = [...days];
    updated[dayIdx].items.push(newItem);
    setDays(updated);
  };

  const handleRemoveItemFromDay = (dayIdx: number, itemIdx: number) => {
    const updated = [...days];
    updated[dayIdx].items = updated[dayIdx].items.filter((_, idx) => idx !== itemIdx);
    setDays(updated);
  };

  const handleItemQtyChange = (dayIdx: number, itemIdx: number, val: number) => {
    const updated = [...days];
    updated[dayIdx].items[itemIdx].qty = Math.max(0, val);
    setDays(updated);
  };

  const handleItemRemarkChange = (dayIdx: number, itemIdx: number, val: string) => {
    const updated = [...days];
    updated[dayIdx].items[itemIdx].remark = val;
    setDays(updated);
  };

  // ROBUST CALCULATED DATE DISPLAY HELPER
  const getDayCalculatedDate = (dayOffset: number | undefined, dIdx: number, isCustomSection?: boolean) => {
    if (isCustomSection) return null;

    const base = parseSafeDate(checkInDate);
    if (!base) return null;

    const safeOffset = typeof dayOffset === 'number' && !isNaN(dayOffset) ? dayOffset : dIdx;

    const targetDate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + safeOffset);
    if (isNaN(targetDate.getTime())) return null;

    return targetDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handlePrintPDF = () => {
    if (days.length === 0) {
      alert('Please build a quotation with at least 1 day/section before exporting to PDF!');
      return;
    }
    setPdfModalOpen(true);
  };

  const isInquiryLocked = !!selectedInquiryId;

  return (
    <div className="space-y-6 w-full font-sans">
      {/* MODULE HEADER BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6B0D24] rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-calculator text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">Resort Quotation &amp; Offer Manager</h2>
            <p className="text-xs text-gray-500 font-medium">
              Create custom quotes, respond to user inquiries, auto-calculate room math, and send offers.
            </p>
          </div>
        </div>

        {/* TOP TAB SWITCHER & ACTION BUTTONS */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePrintPDF}
            className="bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
          >
            <i className="ph-bold ph-printer text-base"></i>
            <span>Export PDF Quote</span>
          </button>

          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => {
                setActiveTabMode('builder');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTabMode === 'builder'
                  ? 'bg-[#6B0D24] text-white shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              📝 Quote Builder
            </button>
            <button
              onClick={() => {
                setSelectedClientPhone(null);
                setActiveTabMode('directory');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTabMode === 'directory'
                  ? 'bg-[#6B0D24] text-white shadow-xs'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              📋 Client Quotes ({sentQuotes.length})
            </button>
          </div>

          <button
            onClick={handleStartBlankQuote}
            className="bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
          >
            <i className="ph-bold ph-plus text-sm"></i>
            <span>New Quote</span>
          </button>
        </div>
      </div>

      {/* DASHBOARD BODY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-xs w-full">
        {/* ================= TAB MODE 1: QUOTE BUILDER & RATE CARD ================= */}
        {activeTabMode === 'builder' && (
          <div className="space-y-6">
            {/* INQUIRIES RESPONSE BAR */}
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="bg-amber-500 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase animate-pulse">
                  📩 {pendingInquiries.length} Pending Inquiries
                </span>
                <span className="text-xs font-bold text-amber-900">
                  Select an inquiry to pre-fill details and revert with exact quote:
                </span>
              </div>

              <select
                value={selectedInquiryId}
                onChange={(e) => handleSelectInquiryToRevert(e.target.value)}
                className="bg-white border border-amber-300 font-bold text-xs text-amber-950 rounded-xl px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="">-- Choose Pending Inquiry to Revert --</option>
                {inquiries.map((inq) => {
                  const dispName = inq.customerName || inq.userName || inq.name || 'Lead';
                  const dispPax = inq.guests || inq.pax || inq.guestCount || 200;
                  const dispDates = inq.weddingDates || inq.weddingDate || inq.date || inq.checkInDate || 'TBD';
                  const isSent = inq.offerSent || inq.status === 'Offer Sent';

                  return (
                    <option key={inq.id} value={inq.id}>
                      {isSent ? '✅ [Offer Sent] ' : '📩 '} {dispName} ({dispPax} Pax | {dispDates})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* USER REQUESTED NEW DATES HIGHLIGHT BANNER */}
            {isUserRequestedDates && (
              <div className="bg-amber-100 border-2 border-amber-400 p-3.5 rounded-2xl flex items-center justify-between text-amber-950 text-xs font-bold shadow-xs">
                <span className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  <span>
                    CUSTOMER REQUESTED NEW DATES: <strong>{checkInDate}</strong> to <strong>{checkOutDate}</strong> (Any Dates Between {maxNightsAllowed} Days). Confirm availability and update quote below.
                  </span>
                </span>
                <span className="bg-amber-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded">
                  New Dates Active
                </span>
              </div>
            )}

            {/* RESORT SELECTOR & CUSTOMER DETAILS BAR */}
            <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    Target Resort
                  </label>

                  {/* STRICT PARTNER LOCK DISPLAY */}
                  {partnerResortId ? (
                    <div className="w-full bg-gray-100 border border-gray-200 rounded-xl p-2.5 text-xs font-black text-[#6B0D24] flex items-center justify-between">
                      <span>{selectedResort?.name || 'Assigned Resort'}</span>
                      <span className="bg-green-100 text-green-800 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                        Assigned Resort
                      </span>
                    </div>
                  ) : (
                    /* SUPER ADMIN SELECTOR */
                    <select
                      value={selectedResortId}
                      onChange={(e) => setSelectedResortId(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-900 outline-none focus:border-[#6B0D24]"
                    >
                      {resorts.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.location} | {r.rooms} Rooms)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="md:col-span-7 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#6B0D24] block">
                      Guest Pax Tier ({paxCount} Pax)
                    </span>
                    <p className="text-[11px] text-gray-500 font-medium">
                      Rooms: <strong>{resortRoomsCount}</strong> &bull; Double Cap:{' '}
                      <strong>{doubleOccupancyCapacity} Pax</strong>
                    </p>
                  </div>

                  {/* PAX PRESETS */}
                  <div className="flex gap-1 bg-white p-1 border border-gray-200 rounded-xl">
                    {[100, 150, 200, 250, 300].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setPaxCount(tier)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          paxCount === tier
                            ? 'bg-[#6B0D24] text-white shadow-xs'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {tier} Pax
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* CUSTOMER & EVENT DATES INPUTS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-stone-200">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Rajesh Sharma"
                    className="w-full bg-white border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none focus:border-[#6B0D24]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Customer Phone
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full bg-white border border-gray-200 rounded-xl p-2 text-xs font-bold outline-none focus:border-[#6B0D24]"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">
                      Check-In Date {isInquiryLocked && '🔒'}
                    </label>
                  </div>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    disabled={isInquiryLocked}
                    className={`w-full border rounded-xl p-2 text-xs font-bold outline-none ${
                      isUserRequestedDates
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-black'
                        : isInquiryLocked
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200'
                        : 'bg-white border-gray-200'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase">
                      Check-Out Date {isInquiryLocked && '🔒'}
                    </label>
                  </div>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    disabled={isInquiryLocked}
                    className={`w-full border rounded-xl p-2 text-xs font-bold outline-none ${
                      isUserRequestedDates
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-black'
                        : isInquiryLocked
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200'
                        : 'bg-white border-gray-200'
                    }`}
                  />
                </div>
              </div>

              {/* MANDATORY DATE AVAILABILITY CONFIRMATION TOGGLE */}
              <div className="pt-2 border-t border-stone-200 space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#6B0D24]">
                  Mandatory Event Dates Availability Status *
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    onClick={() => setDateAvailability('Available')}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      dateAvailability === 'Available'
                        ? 'bg-green-100 border-green-500 text-green-950 shadow-xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>🟢 Dates Confirmed Available (Room Inventory Locked)</span>
                  </label>

                  <label
                    onClick={() => {
                      setDateAvailability('Tentative');
                      setAltDatesModalOpen(true);
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      dateAvailability === 'Tentative'
                        ? 'bg-red-100 border-red-500 text-red-950 shadow-xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>🔴 Dates Tentative / Sold Out (Suggest Alternate Dates)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* AUTOMATED MATH SUMMARY PILLS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-xl">
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 block">
                  Rooms Allocated
                </span>
                <p className="text-base font-black text-blue-950">{roomsNeeded} Rooms</p>
                <span className="text-[10px] text-blue-700 font-medium">Double Occupancy (2 Pax / Room)</span>
              </div>

              <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-xl">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 block">
                  Extra Beds Needed
                </span>
                <p className="text-base font-black text-amber-950">{extraGuestsCount} Extra Beds</p>
                <span className="text-[10px] text-amber-800 font-medium">For guests beyond double occupancy</span>
              </div>

              <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-xl">
                <span className="text-[9px] font-black uppercase tracking-wider text-purple-700 block">
                  Food / Events Pax
                </span>
                <p className="text-base font-black text-purple-950">{paxCount} Pax</p>
                <span className="text-[10px] text-purple-800 font-medium">Auto-applied for Meals &amp; Galas</span>
              </div>

              <div className="bg-green-50/60 border border-green-100 p-3 rounded-xl">
                <span className="text-[9px] font-black uppercase tracking-wider text-green-700 block">
                  Per Guest Average
                </span>
                <p className="text-base font-black text-green-950">
                  ₹{formatCurrency(Math.round(calculationSummary.perPaxCost))}
                </p>
                <span className="text-[10px] text-green-800 font-medium">Incl. Taxes ({rates.taxPercentage}%)</span>
              </div>
            </div>

            {/* TWO COLUMN BUILDER GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* MASTER RATE CARD & REMARKS & TERMS EDITOR (5 Cols) */}
              <div className="lg:col-span-5 bg-stone-50 border border-stone-200 p-4 rounded-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#6B0D24]">
                    1. Master Rate Card Setup
                  </h3>
                  <button
                    onClick={handleSaveRateCard}
                    disabled={savingRates}
                    className="text-[10px] font-bold bg-[#6B0D24] text-white px-2.5 py-1 rounded-lg hover:bg-[#520a1a] transition cursor-pointer disabled:opacity-50"
                  >
                    {savingRates ? 'Saving...' : 'Save Rates & T&Cs'}
                  </button>
                </div>

                {/* PRE-CREATED PARAMETERS WITH REMARKS INPUTS */}
                <div className="space-y-3">
                  {PRECREATED_PARAMETERS.map((param) => (
                    <div key={param.key} className="space-y-1 bg-white p-2 rounded-xl border border-gray-150">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label className="font-bold text-gray-800 truncate max-w-[190px]" title={param.label}>
                          {param.label}
                        </label>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-gray-400 font-mono text-[11px]">₹</span>
                          <input
                            type="number"
                            value={rates[param.key] || 0}
                            onChange={(e) =>
                              setRates({ ...rates, [param.key]: Math.max(0, Number(e.target.value)) })
                            }
                            className="w-20 bg-gray-50 border border-gray-200 rounded-lg p-1 text-right font-mono font-bold text-xs outline-none focus:border-[#6B0D24]"
                          />
                        </div>
                      </div>

                      <input
                        type="text"
                        value={parameterRemarks[param.key] || ''}
                        onChange={(e) =>
                          setParameterRemarks({ ...parameterRemarks, [param.key]: e.target.value })
                        }
                        placeholder="Default remark/note e.g. Includes mocktails..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-md p-1 text-[10px] font-medium text-gray-600 outline-none"
                      />
                    </div>
                  ))}

                  {/* USER CREATED CUSTOM PARAMETERS */}
                  {customParamsMeta.map((cp) => (
                    <div key={cp.key} className="space-y-1 bg-amber-50/60 p-2 rounded-xl border border-amber-200/60">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label className="font-bold text-amber-950 truncate max-w-[190px]" title={cp.label}>
                          ✨ {cp.label}
                        </label>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-amber-600 font-mono text-[11px]">₹</span>
                          <input
                            type="number"
                            value={rates[cp.key] || 0}
                            onChange={(e) =>
                              setRates({ ...rates, [cp.key]: Math.max(0, Number(e.target.value)) })
                            }
                            className="w-20 bg-white border border-amber-300 rounded-lg p-1 text-right font-mono font-bold text-xs outline-none"
                          />
                        </div>
                      </div>

                      <input
                        type="text"
                        value={parameterRemarks[cp.key] || cp.defaultRemark || ''}
                        onChange={(e) =>
                          setParameterRemarks({ ...parameterRemarks, [cp.key]: e.target.value })
                        }
                        placeholder="Default remark e.g. Sound permit till 10 PM..."
                        className="w-full bg-white border border-amber-200 rounded-md p-1 text-[10px] font-medium text-amber-900 outline-none"
                      />
                    </div>
                  ))}

                  <button
                    onClick={handleCreateCustomParameter}
                    className="w-full text-center text-xs font-bold text-[#6B0D24] bg-white hover:bg-stone-100 border border-stone-300 py-2 rounded-xl transition cursor-pointer mt-1"
                  >
                    ➕ Create New Custom Parameter...
                  </button>

                  <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-stone-200">
                    <label className="font-bold text-gray-700">Tax / GST %</label>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        value={rates.taxPercentage}
                        onChange={(e) =>
                          setRates({ ...rates, taxPercentage: Math.max(0, Number(e.target.value)) })
                        }
                        className="w-16 bg-white border border-gray-200 rounded-lg p-1 text-right font-mono font-bold text-xs outline-none focus:border-[#6B0D24]"
                      />
                      <span className="text-gray-500 font-bold">%</span>
                    </div>
                  </div>
                </div>

                {/* TERMS AND CONDITIONS EDITOR */}
                <div className="pt-2 border-t border-stone-200 space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#6B0D24]">
                    📜 Resort Terms &amp; Conditions (Printed on PDF)
                  </label>
                  <textarea
                    value={termsAndConditions}
                    onChange={(e) => setTermsAndConditions(e.target.value)}
                    rows={5}
                    placeholder="Paste or type resort cancellation policies, check-in times, payment terms..."
                    className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-[11px] font-medium text-gray-800 outline-none focus:border-[#6B0D24] leading-relaxed"
                  />
                </div>
              </div>

              {/* ITINERARY BUILDER (7 Cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center border-b pb-2 flex-wrap gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    2. Multi-Day &amp; Section Parameters ({eventDaysCount} Days{customSectionsCount > 0 ? ` + ${customSectionsCount} Custom Section(s)` : ''})
                  </h3>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddDayZero}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                      title="Add Pre-Wedding / Pre-Arrival Day Prior to Day 1"
                    >
                      ➕ Add Day 0
                    </button>

                    <button
                      onClick={handleAddDay}
                      className="bg-gray-900 hover:bg-black text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                    >
                      + Add Day
                    </button>

                    <button
                      onClick={handleAddCustomSection}
                      className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                      title="Add non-day overall charges section e.g. Vendor Charges, Mandap & Decor Setup"
                    >
                      ➕ Add Section
                    </button>
                  </div>
                </div>

                {/* BLANK STATE WHEN 0 DAYS */}
                {days.length === 0 ? (
                  <div className="py-12 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl space-y-3">
                    <i className="ph-bold ph-calculator text-3xl text-gray-300 block mx-auto"></i>
                    <p className="text-xs font-bold text-gray-600">Canvas is Blank</p>
                    <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                      Click below to add your first day or Day 0 and begin adding stay and food parameters.
                    </p>
                    <div className="flex justify-center flex-wrap gap-2 pt-1">
                      <button
                        onClick={handleAddDayZero}
                        className="bg-amber-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs uppercase cursor-pointer"
                      >
                        + Add Day 0 (Pre-Arrival)
                      </button>
                      <button
                        onClick={handleAddDay}
                        className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer"
                      >
                        + Add Day 1
                      </button>
                      <button
                        onClick={handleAddCustomSection}
                        className="bg-gray-900 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase cursor-pointer"
                      >
                        + Add Custom Section
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {days.map((day, dIdx) => {
                      const computedDate = getDayCalculatedDate(day.dayOffset, dIdx, day.isCustomSection);

                      return (
                        <div
                          key={dIdx}
                          className={`bg-white border rounded-2xl p-4 shadow-2xs space-y-3 ${
                            day.isCustomSection ? 'border-amber-300 bg-amber-50/20' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-center border-b border-gray-100 pb-2 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              {day.isCustomSection && (
                                <span className="bg-amber-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded">
                                  Custom Section
                                </span>
                              )}

                              <input
                                type="text"
                                value={day.dayTitle}
                                onChange={(e) => {
                                  const updated = [...days];
                                  updated[dIdx].dayTitle = e.target.value;
                                  setDays(updated);
                                }}
                                className="font-black text-xs text-gray-900 bg-transparent border-b border-dashed border-gray-300 outline-none w-full max-w-[260px]"
                              />

                              {computedDate && (
                                <span className="text-[10px] font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200">
                                  📅 {computedDate}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAddItemToDay(dIdx, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className="bg-gray-50 border border-gray-200 text-gray-700 font-bold text-[10px] rounded-lg p-1 outline-none cursor-pointer"
                                defaultValue=""
                              >
                                <option value="">+ Add Parameter</option>
                                <optgroup label="Standard Parameters">
                                  {PRECREATED_PARAMETERS.map((p) => (
                                    <option key={p.key} value={p.key}>
                                      {p.label}
                                    </option>
                                  ))}
                                </optgroup>
                                {customParamsMeta.length > 0 && (
                                  <optgroup label="Custom Parameters">
                                    {customParamsMeta.map((cp) => (
                                      <option key={cp.key} value={cp.key}>
                                        ✨ {cp.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <option value="CREATE_CUSTOM">➕ Create New Custom Parameter...</option>
                              </select>

                              <button
                                onClick={() => handleRemoveDay(dIdx)}
                                className="text-red-500 hover:text-red-700 font-bold text-xs p-1 cursor-pointer"
                                title="Delete Section/Day"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* DAY ITEMS LIST WITH EDITABLE REMARKS */}
                          <div className="space-y-2">
                            {day.items.map((item, iIdx) => {
                              const itemTotal = item.unitRate * item.qty;

                              return (
                                <div
                                  key={item.id}
                                  className="bg-stone-50/60 border border-stone-100 p-2.5 rounded-xl space-y-1.5 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <span className="font-bold text-gray-800 truncate block" title={item.label}>
                                        {item.label}
                                      </span>
                                      <span className="text-[10px] text-gray-400 font-mono">
                                        ₹{formatCurrency(item.unitRate)} / unit
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Qty:</span>
                                        <input
                                          type="number"
                                          value={item.qty}
                                          onChange={(e) =>
                                            handleItemQtyChange(dIdx, iIdx, Number(e.target.value))
                                          }
                                          className="w-16 bg-white border border-gray-200 rounded p-1 text-center font-bold text-xs outline-none"
                                        />
                                      </div>

                                      <span className="font-black text-gray-900 w-20 text-right font-mono">
                                        ₹{formatCurrency(itemTotal)}
                                      </span>

                                      <button
                                        onClick={() => handleRemoveItemFromDay(dIdx, iIdx)}
                                        className="text-gray-400 hover:text-red-500 font-bold text-xs cursor-pointer"
                                        title="Remove Parameter"
                                      >
                                        ✖
                                      </button>
                                    </div>
                                  </div>

                                  {/* EDITABLE PARAMETER REMARK / DESCRIPTION */}
                                  <input
                                    type="text"
                                    value={item.remark || ''}
                                    onChange={(e) => handleItemRemarkChange(dIdx, iIdx, e.target.value)}
                                    placeholder="Add specific note/remark for this item (e.g. Includes live mocktails, lakeview category)..."
                                    className="w-full bg-white border border-gray-200 rounded-lg p-1 px-2 text-[10px] font-medium text-gray-700 outline-none focus:border-[#6B0D24]"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* GRAND TOTAL SUMMARY & ACTION BUTTONS */}
                {days.length > 0 && (
                  <div className="bg-gray-900 text-white rounded-2xl p-5 space-y-4 shadow-md">
                    <div className="flex justify-between items-center text-xs text-gray-300">
                      <span>Subtotal ({days.length} Sections/Days)</span>
                      <span className="font-mono font-bold">₹{formatCurrency(calculationSummary.subtotal)}</span>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-300 border-b border-gray-800 pb-2">
                      <span>GST / Taxes ({rates.taxPercentage}%)</span>
                      <span className="font-mono font-bold">₹{formatCurrency(calculationSummary.taxAmount)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <div>
                        <span className="text-[10px] text-blue-300 font-black uppercase tracking-widest block">
                          Estimated Grand Total
                        </span>
                        <span className="text-2xl font-black text-white font-mono">
                          ₹{formatCurrency(Math.round(calculationSummary.grandTotal))}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">Per Pax Average</span>
                        <span className="text-base font-black text-amber-400 font-mono">
                          ₹{formatCurrency(Math.round(calculationSummary.perPaxCost))} / person
                        </span>
                      </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="pt-3 border-t border-gray-800">
                      {selectedInquiryId ? (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleSaveOrSendQuote('Draft')}
                            disabled={savingQuote}
                            className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase cursor-pointer disabled:opacity-50"
                          >
                            💾 Save Draft
                          </button>

                          <button
                            onClick={() => handleSaveOrSendQuote('Sent')}
                            disabled={savingQuote}
                            className="bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black py-2.5 rounded-xl text-xs uppercase cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <span>{savingQuote ? 'Sending...' : '🚀 Send Offer to Customer'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleSaveOrSendQuote('Draft')}
                            disabled={savingQuote}
                            className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase cursor-pointer disabled:opacity-50"
                          >
                            💾 Save Draft
                          </button>

                          <button
                            onClick={() => handleSaveOrSendQuote('Sent')}
                            disabled={savingQuote}
                            className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-2.5 rounded-xl text-xs uppercase cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            {savingQuote ? 'Saving...' : '💾 Save Custom Quote'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB MODE 2: CLIENT GROUPED QUOTES DIRECTORY ================= */}
        {activeTabMode === 'directory' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  Client Quotes Directory ({clientGroupedQuotes.length} Clients)
                </h3>
                <p className="text-xs text-gray-500">
                  Select a client to view, edit, or resend quotes generated for them.
                </p>
              </div>

              <button
                onClick={handleStartBlankQuote}
                className="bg-[#6B0D24] text-white font-bold px-3.5 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
              >
                + Create New Quote
              </button>
            </div>

            {loadingQuotes ? (
              <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
                Loading client directory...
              </div>
            ) : clientGroupedQuotes.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs font-bold uppercase tracking-wider">
                No quotes or offers sent yet for this resort.
              </div>
            ) : selectedClientPhone ? (
              /* INDIVIDUAL CLIENT QUOTE HISTORY VIEW */
              <div className="space-y-4">
                {(() => {
                  const clientGroup = clientGroupedQuotes.find(
                    (cg) =>
                      cg.clientPhone === selectedClientPhone ||
                      cg.clientName.toLowerCase() === selectedClientPhone.toLowerCase()
                  );
                  if (!clientGroup) return null;

                  return (
                    <>
                      <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-black uppercase text-gray-400 block">
                            Client Quotations History
                          </span>
                          <h4 className="text-base font-black text-gray-900">{clientGroup.clientName}</h4>
                          <p className="text-xs text-gray-500 font-mono">{clientGroup.clientPhone || 'No Phone'}</p>
                        </div>

                        <button
                          onClick={() => setSelectedClientPhone(null)}
                          className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-800 font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer"
                        >
                          &larr; Back to Client List
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {clientGroup.quotes.map((q) => (
                          <div
                            key={q.id}
                            className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-xs transition"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <span
                                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded inline-block mb-1 ${
                                    q.status === 'Sent'
                                      ? 'bg-green-100 text-green-900'
                                      : q.status === 'Accepted'
                                      ? 'bg-blue-100 text-blue-900'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {q.status}
                                </span>
                                <h5 className="font-black text-gray-900 text-xs">
                                  Quote #{q.id.substring(q.id.length - 6)}
                                </h5>
                                <p className="text-[10px] text-gray-400 font-mono">
                                  {new Date(q.updatedAt).toLocaleDateString()}
                                </p>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-black text-[#6B0D24] block font-mono">
                                  ₹{formatCurrency(Math.round(q.summary?.grandTotal || 0))}
                                </span>
                                <span className="text-[9px] text-gray-400 font-bold block">{q.paxCount} Pax</span>
                              </div>
                            </div>

                            <div className="text-[10px] text-gray-500 font-medium space-y-0.5 bg-gray-50 p-2 rounded-xl border border-gray-100">
                              <p>
                                📅 Dates: <strong>{q.checkInDate || 'TBD'}</strong> to{' '}
                                <strong>{q.checkOutDate || 'TBD'}</strong>
                              </p>
                              <p>
                                🗓️ Itinerary: <strong>{q.days?.length || 0} Sections/Days</strong>
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={() => handleEditQuote(q)}
                                className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 font-bold py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              >
                                ✏️ Edit / Modify
                              </button>

                              <button
                                onClick={() => handleDeleteQuote(q.id)}
                                className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              /* CLIENT DIRECTORY CARDS LIST */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clientGroupedQuotes.map((group, idx) => {
                  const latestQuote = group.quotes[0];

                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setSelectedClientPhone(
                          group.clientPhone || group.clientName.toLowerCase()
                        )
                      }
                      className="bg-white border border-gray-200 hover:border-black rounded-2xl p-4 space-y-3 cursor-pointer transition shadow-2xs group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-gray-900 text-sm group-hover:text-[#6B0D24] transition">
                            {group.clientName}
                          </h4>
                          <p className="text-[10px] text-gray-500 font-mono">
                            {group.clientPhone || 'No Phone'}
                          </p>
                        </div>

                        <span className="bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded">
                          {group.quotes.length} Quotes
                        </span>
                      </div>

                      <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 flex justify-between items-center text-xs">
                        <div>
                          <span className="text-[9px] text-gray-400 font-bold uppercase block">Latest Total</span>
                          <span className="font-black text-gray-900 font-mono">
                            ₹{formatCurrency(Math.round(latestQuote?.summary?.grandTotal || 0))}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] text-gray-400 font-bold uppercase block">Last Updated</span>
                          <span className="font-bold text-gray-600 text-[10px]">
                            {new Date(latestQuote?.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-right pt-1">
                        <span className="text-xs font-bold text-[#6B0D24] group-hover:underline">
                          View All Quotes for {group.clientName} &rarr;
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= SMART EVENT DATE EXTENSION POPUP MODAL ================= */}
      {dateExtensionModalOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                  ⚠️ Event Duration Reached
                </span>
                <h3 className="font-black text-gray-900 text-base">Date Extension Required</h3>
              </div>
              <button
                onClick={() => setDateExtensionModalOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-xs"
              >
                ✖ Cancel
              </button>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed">
              The inquired event dates (<strong>{checkInDate}</strong> to <strong>{checkOutDate}</strong>) allow a maximum of <strong>{maxNightsAllowed} event day(s)</strong> (Day 1 to Day {maxNightsAllowed}).
              <br /><br />
              To add <strong>Day {eventDaysCount + 1}</strong>, please choose how you would like to extend the event dates:
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={handleExtendCheckInDateAndAddDay}
                className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-bold p-3 rounded-2xl text-xs transition cursor-pointer flex items-center justify-between"
              >
                <span>⬅️ Extend Check-In Date (1 Day Earlier)</span>
                <span className="font-mono text-[10px] opacity-80">
                  New Check-In: {shiftDateString(checkInDate, -1)}
                </span>
              </button>

              <button
                onClick={handleExtendCheckOutDateAndAddDay}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold p-3 rounded-2xl text-xs transition cursor-pointer flex items-center justify-between"
              >
                <span>➡️ Extend Check-Out Date (1 Day Later)</span>
                <span className="font-mono text-[10px] opacity-80">
                  New Check-Out: {shiftDateString(checkOutDate, 1)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUGGEST ALTERNATE DATES POPUP MODAL (STRICT INQUIRED DURATION MATCH) ================= */}
      {altDatesModalOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-red-600 tracking-wider block">
                  🔴 Dates Tentative / Sold Out
                </span>
                <h3 className="font-black text-gray-900 text-base">Suggest Alternate Available Dates</h3>
              </div>
              <button
                onClick={() => setAltDatesModalOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-xs"
              >
                ✖ Done
              </button>
            </div>

            <p className="text-xs text-gray-500 font-medium">
              Propose available Check-In dates. Check-Out dates are automatically calculated to match the customer&apos;s inquired stay length ({maxNightsAllowed} days).
            </p>

            <div className="space-y-3 max-h-60 overflow-y-auto">
              {suggestedAltDates.map((alt, idx) => (
                <div key={idx} className="bg-stone-50 border p-3 rounded-2xl space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Alternate Option #{idx + 1}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Check-In</label>
                      <input
                        type="date"
                        min={todayStr}
                        value={alt.checkIn}
                        onChange={(e) => {
                          const newIn = e.target.value;
                          const updated = [...suggestedAltDates];
                          updated[idx].checkIn = newIn;
                          if (newIn) {
                            updated[idx].checkOut = shiftDateString(newIn, maxNightsAllowed);
                          }
                          setSuggestedAltDates(updated);
                        }}
                        className="bg-white border rounded-xl p-2 text-xs font-bold w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Check-Out (Auto Locked)</label>
                      <input
                        type="date"
                        value={alt.checkOut}
                        disabled
                        className="bg-gray-100 border border-gray-200 rounded-xl p-2 text-xs font-bold w-full text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSuggestedAltDates([...suggestedAltDates, { checkIn: '', checkOut: '' }])}
              className="w-full text-center text-xs font-bold text-[#6B0D24] bg-stone-100 p-2 rounded-xl"
            >
              + Add Another Date Option
            </button>

            <button
              onClick={() => setAltDatesModalOpen(false)}
              className="w-full bg-[#6B0D24] text-white font-bold py-3 rounded-2xl text-xs uppercase"
            >
              Confirm Alternate Dates
            </button>
          </div>
        </div>
      )}

      {/* ================= BRANDED PRINTABLE PDF MODAL ================= */}
      {pdfModalOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            <header className="p-4 bg-gray-50 border-b flex justify-between items-center print:hidden">
              <span className="font-black text-xs text-gray-900 uppercase tracking-wider">
                📄 Official Branded Quotation Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
                >
                  🖨️ Print / Save as PDF
                </button>
                <button
                  onClick={() => setPdfModalOpen(false)}
                  className="bg-gray-200 text-gray-700 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  ✖ Close
                </button>
              </div>
            </header>

            {/* PRINTABLE DOCUMENT BODY */}
            <div className="p-8 space-y-6 overflow-y-auto flex-1 font-sans text-gray-900 print:p-0 print:overflow-visible">
              {/* BRANDED HEADER */}
              <div className="flex justify-between items-start border-b pb-6">
                <div>
                  <h1 className="text-2xl font-black text-[#6B0D24]">{selectedResort?.name || 'Luxury Resort'}</h1>
                  <p className="text-xs text-gray-500 font-bold mt-1">
                    📍 {selectedResort?.location || 'India'} &bull; {resortRoomsCount} Inventory Rooms
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                    Official Quotation
                  </span>
                  <span className="text-xs text-gray-500 font-mono font-bold">
                    Date: {new Date().toLocaleDateString('en-IN')}
                  </span>
                </div>
              </div>

              {/* CLIENT & EVENT DETAILS */}
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Client Name</span>
                  <span className="font-black text-gray-900">{customerName || 'Valued Guest'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Phone</span>
                  <span className="font-bold text-gray-900">{customerPhone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Event Dates</span>
                  <span className="font-bold text-gray-900">
                    {checkInDate || 'TBD'} to {checkOutDate || 'TBD'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Guest Count</span>
                  <span className="font-black text-[#6B0D24]">{paxCount} Pax</span>
                </div>
              </div>

              {/* ITINERARY & SECTIONS BREAKDOWN TABLE */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 border-b pb-1">
                  Itemized Event Itinerary &amp; Services Breakdown
                </h3>

                {days.map((day, dIdx) => {
                  const computedDate = getDayCalculatedDate(day.dayOffset, dIdx, day.isCustomSection);

                  return (
                    <div key={day.dayNumber} className="border border-gray-200 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-center border-b pb-1.5">
                        <h4 className="font-black text-xs text-[#6B0D24]">{day.dayTitle}</h4>
                        {computedDate && (
                          <span className="text-[10px] font-bold text-gray-500">📅 {computedDate}</span>
                        )}
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] font-bold text-gray-400 uppercase">
                          <tr>
                            <th className="pb-1">Parameter / Service &amp; Remarks</th>
                            <th className="pb-1 text-center">Qty</th>
                            <th className="pb-1 text-right">Unit Rate</th>
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
                  );
                })}
              </div>

              {/* FINANCIAL SUMMARY TABLE */}
              <div className="bg-stone-900 text-white p-5 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold">₹{formatCurrency(calculationSummary.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>GST / Taxes ({rates.taxPercentage}%)</span>
                  <span className="font-mono font-bold">₹{formatCurrency(calculationSummary.taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-stone-800 pt-2 text-sm font-black text-white">
                  <span>Grand Total</span>
                  <span className="font-mono text-amber-400">
                    ₹{formatCurrency(Math.round(calculationSummary.grandTotal))}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-gray-400 pt-1">
                  <span>Average Cost Per Guest ({paxCount} Pax)</span>
                  <span className="font-mono font-bold">
                    ₹{formatCurrency(Math.round(calculationSummary.perPaxCost))} / person
                  </span>
                </div>
              </div>

              {/* DYNAMIC RESORT TERMS & CONDITIONS */}
              <div className="text-[10px] text-gray-500 space-y-1 pt-4 border-t whitespace-pre-line leading-relaxed">
                <p className="font-black uppercase text-gray-700 text-[11px]">Resort Terms &amp; Conditions:</p>
                <p>{termsAndConditions}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}