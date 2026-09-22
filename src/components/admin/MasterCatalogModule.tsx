'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const PRICING_RULES = [
  { val: 'flat', label: '1. Flat Fee (One-Time)' },
  { val: 'per_person', label: '2. Per Person (Cost x Guests)' },
  { val: 'per_person_event', label: '3. Per Person, Per Event' },
  { val: 'per_qty', label: '4. Per Item Qty (Cost x Qty)' },
  { val: 'per_qty_event', label: '5. Per Item Qty, Per Event' },
  { val: 'bundle_tiered', label: '6. Multi-Event Bundle (e.g. DJ)' },
  { val: 'per_person_day', label: '7. Per Person, Per Day' },
  { val: 'per_qty_day', label: '8. Per Item Qty, Per Day' },
];

const generateId = () => 'item_' + Math.random().toString(36).substring(2, 11);

export default function MasterCatalogModule() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [globalCosts, setGlobalCosts] = useState({
    baseDecorDesc: '',
    addonDesc: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Catalog from Firestore
  const loadCatalogFromFirebase = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'schemas', 'master_catalog_schema'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCatalog(data.structure || []);
        setGlobalCosts(data.globalCosts || { baseDecorDesc: '', addonDesc: '' });
      }
    } catch (err) {
      console.error('Error loading master catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogFromFirebase();
  }, []);

  // Save Catalog to Firestore
  const handleSaveCatalog = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      await setDoc(doc(db, 'schemas', 'master_catalog_schema'), {
        globalCosts,
        structure: catalog,
        updated_at: new Date().toISOString(),
      });
      setSaveMessage({ type: 'success', text: '✓ Master Catalog saved successfully!' });
    } catch (err: any) {
      console.error('Error saving master catalog:', err);
      setSaveMessage({ type: 'error', text: err.message || 'Failed to save catalog.' });
    } finally {
      setSaving(false);
    }
  };

  // Group Operations
  const handleAddGroup = (type: 'general' | 'event') => {
    const defaultName = type === 'general' ? 'General Requirements' : 'New Event (e.g., Sangeet)';
    const name = prompt('Enter List Name:', defaultName);
    if (!name) return;

    setCatalog((prev) => [
      ...prev,
      { id: generateId(), type, name: name.trim(), items: [] },
    ]);
  };

  const handleDuplicateGroup = (gIdx: number) => {
    const originalGroup = catalog[gIdx];
    const newName = prompt('Enter name for duplicated event:', originalGroup.name + ' (Copy)');
    if (!newName) return;

    const clonedGroup = JSON.parse(JSON.stringify(originalGroup));
    clonedGroup.id = generateId();
    clonedGroup.name = newName.trim();
    clonedGroup.items.forEach((item: any) => (item.id = generateId()));

    setCatalog((prev) => {
      const updated = [...prev];
      updated.splice(gIdx + 1, 0, clonedGroup);
      return updated;
    });
  };

  const handleRenameGroup = (gIdx: number) => {
    const currentName = catalog[gIdx]?.name || '';
    const newName = prompt('Enter new list name:', currentName);
    if (!newName) return;

    setCatalog((prev) => {
      const updated = [...prev];
      updated[gIdx] = { ...updated[gIdx], name: newName.trim() };
      return updated;
    });
  };

  const handleDeleteGroup = (gIdx: number) => {
    if (!confirm('Are you sure you want to delete this list and all its items?')) return;
    setCatalog((prev) => prev.filter((_, idx) => idx !== gIdx));
  };

  const handleMoveGroup = (gIdx: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && gIdx === 0) ||
      (direction === 'down' && gIdx === catalog.length - 1)
    )
      return;

    setCatalog((prev) => {
      const updated = [...prev];
      const targetIdx = direction === 'up' ? gIdx - 1 : gIdx + 1;
      [updated[gIdx], updated[targetIdx]] = [updated[targetIdx], updated[gIdx]];
      return updated;
    });
  };

  // Item Operations inside a Group
  const handleAddItem = (gIdx: number) => {
    const name = prompt('Enter Element Name (e.g., DJ Setup, Floral Arch):');
    if (!name) return;

    setCatalog((prev) => {
      const updated = [...prev];
      updated[gIdx].items.push({
        id: generateId(),
        name: name.trim(),
        pricingRule: 'flat',
        thumbnail: '',
        description: '',
      });
      return updated;
    });
  };

  const handleRenameItem = (gIdx: number, iIdx: number) => {
    const currentName = catalog[gIdx]?.items[iIdx]?.name || '';
    const newName = prompt('Enter new item name:', currentName);
    if (!newName) return;

    setCatalog((prev) => {
      const updated = [...prev];
      updated[gIdx].items[iIdx].name = newName.trim();
      return updated;
    });
  };

  const handleDeleteItem = (gIdx: number, iIdx: number) => {
    if (!confirm('Delete this item?')) return;
    setCatalog((prev) => {
      const updated = [...prev];
      updated[gIdx].items.splice(iIdx, 1);
      return updated;
    });
  };

  const handleMoveItem = (gIdx: number, iIdx: number, direction: 'up' | 'down') => {
    const groupItems = catalog[gIdx]?.items || [];
    if (
      (direction === 'up' && iIdx === 0) ||
      (direction === 'down' && iIdx === groupItems.length - 1)
    )
      return;

    setCatalog((prev) => {
      const updated = [...prev];
      const items = [...updated[gIdx].items];
      const targetIdx = direction === 'up' ? iIdx - 1 : iIdx + 1;
      [items[iIdx], items[targetIdx]] = [items[targetIdx], items[iIdx]];
      updated[gIdx].items = items;
      return updated;
    });
  };

  const handleUpdateItemProperty = (gIdx: number, iIdx: number, prop: string, val: any) => {
    setCatalog((prev) => {
      const updated = [...prev];
      updated[gIdx].items[iIdx][prop] = val;
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls Bar */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph ph-database text-[#6B0D24]"></i> Master Data Catalog
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Define global pricing elements, services, and math calculation rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => handleAddGroup('general')}
            className="bg-gray-800 hover:bg-black text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <i className="ph ph-list-bullets text-base"></i> + General List
          </button>

          <button
            onClick={() => handleAddGroup('event')}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <i className="ph ph-tent text-base"></i> + Event List
          </button>

          <button
            onClick={handleSaveCatalog}
            disabled={saving}
            className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <i className="ph ph-cloud-arrow-up text-base text-[#C5A059]"></i>
            {saving ? 'Saving...' : 'Save Master List'}
          </button>
        </div>
      </div>

      {/* ALERT MESSAGE */}
      {saveMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            saveMessage.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <i
            className={`text-base ph-bold ${
              saveMessage.type === 'success' ? 'ph-check-circle text-green-600' : 'ph-warning-circle text-red-600'
            }`}
          ></i>
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* GLOBAL COSTS DESCRIPTIONS */}
      <div className="bg-[#FAF6F0] border-2 border-[#C5A059]/40 rounded-3xl overflow-hidden shadow-xs">
        <div className="bg-[#6B0D24] text-white px-6 py-3.5 font-black text-xs uppercase tracking-widest flex items-center gap-2">
          <i className="ph ph-crown text-base text-[#C5A059]"></i> Hardcoded Global Costs Explanations
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">
              Base Decor (Up to 3 Events) Description
            </label>
            <textarea
              value={globalCosts.baseDecorDesc}
              onChange={(e) => setGlobalCosts((prev) => ({ ...prev, baseDecorDesc: e.target.value }))}
              rows={3}
              placeholder="Explain what base decor covers to the customer..."
              className="w-full p-3 border border-gray-200 rounded-2xl text-xs font-medium outline-none focus:border-[#6B0D24] bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">
              4th Event Add-on Description
            </label>
            <textarea
              value={globalCosts.addonDesc}
              onChange={(e) => setGlobalCosts((prev) => ({ ...prev, addonDesc: e.target.value }))}
              rows={3}
              placeholder="Explain extra charges for adding a 4th event..."
              className="w-full p-3 border border-gray-200 rounded-2xl text-xs font-medium outline-none focus:border-[#6B0D24] bg-gray-50"
            />
          </div>
        </div>
      </div>

      {/* MASTER CATALOG LISTS CANVAS */}
      {loading ? (
        <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
          <i className="ph-bold ph-spinner animate-spin text-4xl mb-3 text-[#6B0D24] block mx-auto"></i>
          Loading Master Data Catalog...
        </div>
      ) : catalog.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-gray-400 text-xs font-bold">
          No lists created yet. Click "+ General List" or "+ Event List" above to start.
        </div>
      ) : (
        <div className="space-y-6">
          {catalog.map((group, gIdx) => {
            const isGeneral = group.type === 'general';
            const headerColor = isGeneral ? 'bg-gray-900 text-white' : 'bg-[#6B0D24] text-white';
            const borderColor = isGeneral ? 'border-gray-900' : 'border-[#6B0D24]';

            return (
              <div
                key={group.id || gIdx}
                className={`bg-white border-t-4 ${borderColor} rounded-3xl shadow-xs overflow-hidden`}
              >
                {/* Group Header */}
                <div className={`${headerColor} px-6 py-4 flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <i className={isGeneral ? 'ph ph-list-bullets text-lg' : 'ph ph-tent text-lg'}></i>
                    <h3 className="text-sm font-black uppercase tracking-wider">{group.name}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(gIdx, 'up')}
                      className="p-1 hover:bg-white/20 rounded transition"
                      title="Move Up"
                    >
                      <i className="ph ph-caret-up"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveGroup(gIdx, 'down')}
                      className="p-1 hover:bg-white/20 rounded transition"
                      title="Move Down"
                    >
                      <i className="ph ph-caret-down"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateGroup(gIdx)}
                      className="p-1 hover:bg-white/20 rounded transition"
                      title="Duplicate List"
                    >
                      <i className="ph ph-copy"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRenameGroup(gIdx)}
                      className="p-1 hover:bg-white/20 rounded transition"
                      title="Rename List"
                    >
                      <i className="ph ph-pencil-simple"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(gIdx)}
                      className="p-1 text-red-300 hover:bg-white/20 rounded transition"
                      title="Delete List"
                    >
                      <i className="ph ph-trash"></i>
                    </button>
                  </div>
                </div>

                {/* Items Container */}
                <div className="p-6 space-y-4 bg-gray-50/50">
                  {(group.items || []).map((item: any, iIdx: number) => (
                    <div
                      key={item.id || iIdx}
                      className="flex flex-col bg-white border border-gray-200 p-5 rounded-2xl shadow-2xs hover:border-[#6B0D24]/30 transition space-y-4"
                    >
                      {/* Item Row Top */}
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-4 flex-1">
                          <span
                            className="font-black text-gray-900 text-sm truncate max-w-[200px]"
                            title={item.name}
                          >
                            {item.name}
                          </span>

                          <div className="flex items-center gap-2 bg-[#FAF6F0] border border-[#6B0D24]/10 p-1.5 rounded-xl">
                            <span className="text-[9px] font-black text-[#6B0D24] uppercase tracking-wider">
                              Math Rule:
                            </span>
                            <select
                              value={item.pricingRule || 'flat'}
                              onChange={(e) =>
                                handleUpdateItemProperty(gIdx, iIdx, 'pricingRule', e.target.value)
                              }
                              className="text-xs border border-gray-200 rounded-lg p-1 bg-white font-bold text-gray-800 outline-none"
                            >
                              {PRICING_RULES.map((pr) => (
                                <option key={pr.val} value={pr.val}>
                                  {pr.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Item Control Icons */}
                        <div className="flex items-center gap-1 text-gray-400 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleMoveItem(gIdx, iIdx, 'up')}
                            className="p-1.5 hover:text-gray-900 transition"
                          >
                            <i className="ph ph-caret-up"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveItem(gIdx, iIdx, 'down')}
                            className="p-1.5 hover:text-gray-900 transition"
                          >
                            <i className="ph ph-caret-down"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRenameItem(gIdx, iIdx)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 transition"
                          >
                            <i className="ph ph-pencil-simple"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(gIdx, iIdx)}
                            className="p-1.5 text-red-500 hover:text-red-700 transition"
                          >
                            <i className="ph ph-trash"></i>
                          </button>
                        </div>
                      </div>

                      {/* Item Bottom Props: Thumbnail & Description */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                            <i className="ph ph-image"></i> Thumbnail URL
                          </label>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={item.thumbnail || ''}
                            onChange={(e) =>
                              handleUpdateItemProperty(gIdx, iIdx, 'thumbnail', e.target.value)
                            }
                            className="w-full text-xs border border-gray-200 rounded-xl p-2.5 outline-none focus:border-[#6B0D24] bg-gray-50"
                          />
                          {item.thumbnail && (
                            <img
                              src={item.thumbnail}
                              alt="Thumbnail"
                              className="mt-2 h-16 w-24 object-cover rounded-xl border border-gray-200 shadow-2xs"
                            />
                          )}
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold text-gray-600 mb-1 flex items-center gap-1">
                            <i className="ph ph-text-align-left"></i> Customer Explanation Description
                          </label>
                          <textarea
                            placeholder="Explain to the customer what is included in this item..."
                            value={item.description || ''}
                            onChange={(e) =>
                              handleUpdateItemProperty(gIdx, iIdx, 'description', e.target.value)
                            }
                            rows={3}
                            className="w-full text-xs border border-gray-200 rounded-xl p-2.5 outline-none focus:border-[#6B0D24] bg-gray-50 font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleAddItem(gIdx)}
                      className="text-xs bg-white hover:bg-gray-100 text-gray-800 font-bold py-2.5 px-4 rounded-xl border border-gray-200 shadow-2xs inline-flex items-center gap-2 transition cursor-pointer"
                    >
                      <i className="ph ph-plus-circle text-[#6B0D24] text-base"></i> Add Pricing Element
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}