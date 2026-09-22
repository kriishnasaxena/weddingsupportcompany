'use client';

import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface CalendarRule {
  dateType: 'range';
  startDate: string;
  endDate: string;
  adjustmentType: 'discount_percent';
  value: string;
  title?: string;
}

interface PartnerCalendarDiscountsProps {
  resortId: string;
  resortData: any;
  onUpdateSuccess: () => void;
}

export default function PartnerCalendarDiscounts({
  resortId,
  resortData,
  onUpdateSuccess,
}: PartnerCalendarDiscountsProps) {
  const existingRules: CalendarRule[] = resortData?.core_calendar || [];

  const [rules, setRules] = useState<CalendarRule[]>(existingRules);
  const [showAddForm, setShowAddForm] = useState(false);

  // New Rule Form State
  const [ruleTitle, setRuleTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [discountPercent, setDiscountPercent] = useState('15');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!startDate || !endDate || !discountPercent) {
      setMessage({ type: 'error', text: 'Please fill in Start Date, End Date, and Discount Percentage.' });
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setMessage({ type: 'error', text: 'End date must be after Start date.' });
      return;
    }

    setSaving(true);

    try {
      const newRule: CalendarRule = {
        dateType: 'range',
        startDate,
        endDate,
        adjustmentType: 'discount_percent',
        value: discountPercent,
        title: ruleTitle.trim() || `${discountPercent}% Off Special`,
      };

      const updatedRules = [...rules, newRule];

      await updateDoc(doc(db, 'resort_data', resortId), {
        core_calendar: updatedRules,
      });

      setRules(updatedRules);
      setShowAddForm(false);
      setRuleTitle('');
      setStartDate('');
      setEndDate('');
      setMessage({ type: 'success', text: 'Discount rule added successfully!' });
      onUpdateSuccess();
    } catch (err: any) {
      console.error('Error adding rule:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to add discount rule.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    if (!confirm('Are you sure you want to remove this discount rule?')) return;
    setSaving(true);

    try {
      const updatedRules = rules.filter((_, idx) => idx !== index);
      await updateDoc(doc(db, 'resort_data', resortId), {
        core_calendar: updatedRules,
      });

      setRules(updatedRules);
      setMessage({ type: 'success', text: 'Discount rule removed.' });
      onUpdateSuccess();
    } catch (err: any) {
      console.error('Error deleting rule:', err);
      setMessage({ type: 'error', text: 'Failed to delete rule.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900">
            Calendar Discounts & Seasonality
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Configure date-range discounts for off-season dates (e.g., Monsoon 15% Off).
          </p>
        </div>

        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 shadow-2xs"
          >
            <i className="ph-bold ph-plus"></i> Add Discount Range
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <i className="ph-bold ph-check-circle text-base"></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* ADD NEW RULE FORM */}
      {showAddForm && (
        <form onSubmit={handleAddRule} className="bg-stone-50 border border-stone-200 p-5 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="text-xs font-black uppercase text-[#6B0D24]">
              New Date Range Discount
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-gray-400 font-bold hover:text-black"
            >
              ✖ Cancel
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
              Discount Campaign Name
            </label>
            <input
              type="text"
              value={ruleTitle}
              onChange={(e) => setRuleTitle(e.target.value)}
              placeholder="e.g. Monsoon Off-Season Special"
              className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-800 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-xs font-bold text-gray-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-xs font-bold text-gray-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                Discount (%)
              </label>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                min="1"
                max="90"
                required
                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-xs font-bold text-gray-800 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#6B0D24] text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs"
          >
            {saving ? 'Saving...' : 'Confirm & Activate Discount'}
          </button>
        </form>
      )}

      {/* ACTIVE RULES LIST */}
      <div className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-4">
            No seasonality discount rules configured. Base pricing applies to all dates.
          </p>
        ) : (
          rules.map((rule, idx) => (
            <div
              key={idx}
              className="bg-white border border-gray-200 p-4 rounded-xl flex justify-between items-center"
            >
              <div>
                <span className="bg-green-50 text-green-700 border border-green-200 text-[9px] font-black uppercase px-2 py-0.5 rounded inline-block mb-1">
                  {rule.value}% DISCOUNT
                </span>
                <h4 className="font-black text-gray-900 text-sm">
                  {rule.title || `${rule.value}% Off Date Range`}
                </h4>
                <p className="text-xs text-gray-500 font-medium">
                  {rule.startDate} &rarr; {rule.endDate}
                </p>
              </div>

              <button
                onClick={() => handleDeleteRule(idx)}
                className="text-gray-400 hover:text-red-600 p-2 transition"
                title="Delete Discount"
              >
                <i className="ph-bold ph-trash text-lg"></i>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}