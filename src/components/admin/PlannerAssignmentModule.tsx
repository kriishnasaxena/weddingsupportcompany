'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface OptionItem {
  id: string;
  name: string;
}

export default function PlannerAssignmentModule() {
  // Dropdown Options
  const [resorts, setResorts] = useState<OptionItem[]>([]);
  const [planners, setPlanners] = useState<OptionItem[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  // Selected Pair State
  const [selectedResortId, setSelectedResortId] = useState('');
  const [selectedPlannerId, setSelectedPlannerId] = useState('');
  const [currentPairId, setCurrentPairId] = useState<string | null>(null);

  // Schema & Pricing Form State
  const [masterCatalogSchema, setMasterCatalogSchema] = useState<any[]>([]);
  const [globalGuidelines, setGlobalGuidelines] = useState({
    baseDesc: 'Loading...',
    addonDesc: 'Loading...',
  });
  const [pricingFormData, setPricingFormData] = useState<Record<string, any>>({});
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [pairStatus, setPairStatus] = useState({ text: '', isExisting: false });

  // Save / Copy States
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Clone Modal States
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [sourceResortsList, setSourceResortsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedSourcePairId, setSelectedSourcePairId] = useState('');
  const [priceAdjustmentPercent, setPriceAdjustmentPercent] = useState<number>(0);
  const [loadingSources, setLoadingSources] = useState(false);

  // 1. Fetch Resorts & Planners on Mount
  useEffect(() => {
    const fetchDropdowns = async () => {
      setLoadingDropdowns(true);
      try {
        const [resortSnap, plannerSnap] = await Promise.all([
          getDocs(collection(db, 'resort_data')),
          getDocs(collection(db, 'planner_data')),
        ]);

        const rList: OptionItem[] = [];
        resortSnap.forEach((d) => {
          const data = d.data();
          rList.push({ id: d.id, name: data._recordName || data.core_name || d.id });
        });
        rList.sort((a, b) => a.name.localeCompare(b.name));
        setResorts(rList);

        const pList: OptionItem[] = [];
        plannerSnap.forEach((d) => {
          const data = d.data();
          pList.push({ id: d.id, name: data._recordName || data.core_company || d.id });
        });
        pList.sort((a, b) => a.name.localeCompare(b.name));
        setPlanners(pList);
      } catch (err) {
        console.error('Error loading dropdowns:', err);
      } finally {
        setLoadingDropdowns(false);
      }
    };

    fetchDropdowns();
  }, []);

  // 2. Load Pricing Form for Selected Resort + Planner Pair
  const handleLoadPricingForm = async () => {
    if (!selectedResortId || !selectedPlannerId) {
      alert('Please select both a Resort and a Planner.');
      return;
    }

    const pairId = `${selectedResortId}_${selectedPlannerId}`;
    setCurrentPairId(pairId);
    setSaveMessage(null);

    try {
      // Fetch Master Catalog Schema
      const mcSnap = await getDoc(doc(db, 'schemas', 'master_catalog_schema'));
      if (mcSnap.exists()) {
        const data = mcSnap.data();
        setMasterCatalogSchema(data.structure || []);
        setGlobalGuidelines({
          baseDesc: data.globalCosts?.baseDecorDesc || 'No description provided.',
          addonDesc: data.globalCosts?.addonDesc || 'No description provided.',
        });
      } else {
        alert('Master Catalog Schema not found in Firestore.');
        return;
      }

      // Fetch Existing Pricing Profile
      const priceSnap = await getDoc(doc(db, 'resort_planner_pricing', pairId));
      if (priceSnap.exists()) {
        setPairStatus({ text: 'Editing Existing Pricing Profile', isExisting: true });
        setPricingFormData(priceSnap.data());
      } else {
        setPairStatus({ text: 'Creating New Pricing Profile...', isExisting: false });
        setPricingFormData({});
      }

      setWorkspaceLoaded(true);
    } catch (err) {
      console.error('Error loading pricing form:', err);
      alert('Failed to load pricing data.');
    }
  };

  // Form Field Change
  const handlePriceChange = (fieldId: string, val: string) => {
    setPricingFormData((prev) => ({
      ...prev,
      [fieldId]: val !== '' ? Number(val) : '',
    }));
  };

  // SAVE PRICING TO FIRESTORE
  const handleSavePricing = async () => {
    if (!currentPairId || !selectedResortId || !selectedPlannerId) return;

    const targetResort = resorts.find((r) => r.id === selectedResortId);
    const targetPlanner = planners.find((p) => p.id === selectedPlannerId);

    setSaving(true);
    setSaveMessage(null);

    const dataToSave: Record<string, any> = {
      resortId: selectedResortId,
      resortName: targetResort?.name || 'Assigned Resort',
      plannerId: selectedPlannerId,
      plannerName: targetPlanner?.name || 'Assigned Planner',
      updatedAt: new Date().toISOString(),
      core_base_decor_3_events: Number(pricingFormData.core_base_decor_3_events || 0),
      core_addon_decor_per_event: Number(pricingFormData.core_addon_decor_per_event || 0),
    };

    // Extract all item prices from form state
    const extractVals = (nodes: any[]) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach((node) => {
        if (node.pricingRule) {
          const val = pricingFormData[node.id];
          if (val !== undefined && val !== '') {
            dataToSave[node.id] = Number(val);
          }
        }
        if (node.items) extractVals(node.items);
      });
    };

    extractVals(masterCatalogSchema);

    try {
      await setDoc(doc(db, 'resort_planner_pricing', currentPairId), dataToSave);
      setSaveMessage({ type: 'success', text: '✓ Custom pricing saved successfully!' });
      setPairStatus({ text: '✓ Saved just now.', isExisting: true });
    } catch (err: any) {
      console.error('Error saving pricing:', err);
      setSaveMessage({ type: 'error', text: err.message || 'Failed to save pricing.' });
    } finally {
      setSaving(false);
    }
  };

  // OPEN CLONE / COPY MODAL
  const handleOpenCopyModal = async () => {
    if (!selectedPlannerId) return;
    setLoadingSources(true);
    setCopyModalOpen(true);

    try {
      const q = query(
        collection(db, 'resort_planner_pricing'),
        where('plannerId', '==', selectedPlannerId)
      );
      const snap = await getDocs(q);

      const options: { id: string; name: string }[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.resortId !== selectedResortId) {
          options.push({
            id: d.id,
            name: data.resortName || d.id,
          });
        }
      });

      setSourceResortsList(options);
    } catch (err) {
      console.error('Error searching source resorts:', err);
    } finally {
      setLoadingSources(false);
    }
  };

  // EXECUTE CLONE / COPY PRICING
  const handleExecuteCopy = async () => {
    if (!selectedSourcePairId) {
      alert('Please select a source resort.');
      return;
    }

    try {
      const docSnap = await getDoc(doc(db, 'resort_planner_pricing', selectedSourcePairId));
      if (docSnap.exists()) {
        const rawData = docSnap.data();
        const factor = 1 + priceAdjustmentPercent / 100;
        const adjustedData: Record<string, any> = {};

        const metadataKeys = ['resortId', 'resortName', 'plannerId', 'plannerName', 'updatedAt'];

        Object.keys(rawData).forEach((key) => {
          if (!metadataKeys.includes(key) && typeof rawData[key] === 'number') {
            adjustedData[key] = Math.round(rawData[key] * factor);
          } else {
            adjustedData[key] = rawData[key];
          }
        });

        setPricingFormData(adjustedData);
        alert(`Prices copied with ${priceAdjustmentPercent}% adjustment! Review and click Save.`);
        setCopyModalOpen(false);
      }
    } catch (err) {
      console.error('Error executing copy:', err);
    }
  };

  // RECURSIVE SCHEMA UI RENDERER
  const renderSchemaNodes = (nodes: any[]): React.ReactNode => {
    if (!Array.isArray(nodes)) return null;

    return nodes.map((node) => {
      if (
        node.type === 'category' ||
        node.type === 'subcategory' ||
        node.type === 'general' ||
        node.type === 'event'
      ) {
        const isCategory = node.type === 'category';
        return (
          <div
            key={node.id || node.name}
            className={`border rounded-2xl mb-6 ${
              isCategory ? 'bg-white border-gray-200 p-6 shadow-xs' : 'bg-gray-50 border-gray-100 p-4 mb-4'
            }`}
          >
            <h4 className="font-black text-gray-900 text-sm mb-4 border-b pb-2 border-gray-100 flex items-center gap-2">
              <i className="ph-fill ph-caret-right text-gray-400"></i> {node.name}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {node.items && renderSchemaNodes(node.items)}
            </div>
          </div>
        );
      }

      if (node.pricingRule) {
        const ruleLabel = (node.pricingRule || '').replace(/_/g, ' ');
        const val = pricingFormData[node.id] !== undefined ? pricingFormData[node.id] : '';

        return (
          <div key={node.id} className="flex flex-col">
            <label className="text-xs font-bold text-gray-600 mb-1 flex justify-between">
              <span>{node.name}</span>
              <span className="text-[9px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded uppercase tracking-wider">
                {ruleLabel}
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                ₹
              </span>
              <input
                type="number"
                value={val}
                onChange={(e) => handlePriceChange(node.id, e.target.value)}
                placeholder="0"
                className="w-full pl-8 p-2.5 rounded-xl border border-gray-300 focus:border-[#6B0D24] outline-none font-bold text-gray-900 text-xs"
              />
            </div>
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph ph-user-switch text-[#6B0D24]"></i> Pricing Connector
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Assign customized Master Catalog pricing for a specific Resort & Planner pair.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-stone-50 p-3 rounded-2xl border border-stone-200 w-full md:w-auto">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              1. Select Resort
            </label>
            {loadingDropdowns ? (
              <div className="text-xs text-gray-400">Loading...</div>
            ) : (
              <select
                value={selectedResortId}
                onChange={(e) => setSelectedResortId(e.target.value)}
                className="w-44 p-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none focus:border-[#6B0D24]"
              >
                <option value="">-- Choose Resort --</option>
                {resorts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <i className="ph-bold ph-plus text-gray-300 hidden md:block"></i>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              2. Select Planner
            </label>
            {loadingDropdowns ? (
              <div className="text-xs text-gray-400">Loading...</div>
            ) : (
              <select
                value={selectedPlannerId}
                onChange={(e) => setSelectedPlannerId(e.target.value)}
                className="w-44 p-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-900 outline-none focus:border-[#6B0D24]"
              >
                <option value="">-- Choose Planner --</option>
                {planners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={handleLoadPricingForm}
            className="bg-[#6B0D24] text-white font-bold px-5 py-2.5 rounded-xl hover:bg-[#520a1a] transition shadow-xs text-xs uppercase tracking-wider cursor-pointer"
          >
            Load Form
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

      {/* WORKSPACE AREA (FULL WIDTH) */}
      {workspaceLoaded && (
        <div className="w-full bg-white border border-gray-200 rounded-3xl shadow-xs overflow-hidden flex flex-col">

          {/* RIGHT: PRICING FORM */}
          <div className="flex-1 w-full bg-white border border-gray-200 rounded-3xl shadow-xs overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-gray-50">
              <div>
                <h3 className="font-black text-gray-900 text-base">Input Customized Pricing</h3>
                <p
                  className={`text-xs font-bold mt-0.5 ${
                    pairStatus.isExisting ? 'text-amber-600' : 'text-[#6B0D24]'
                  }`}
                >
                  {pairStatus.text}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenCopyModal}
                  className="bg-gray-800 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-black transition flex items-center gap-1.5 text-xs shadow-2xs"
                >
                  <i className="ph ph-copy text-sm"></i> Clone from Other Resort
                </button>

                <button
                  type="button"
                  onClick={handleSavePricing}
                  disabled={saving}
                  className="bg-green-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-green-700 transition flex items-center gap-1.5 text-xs shadow-md disabled:opacity-50"
                >
                  <i className="ph-bold ph-floppy-disk text-sm"></i>
                  {saving ? 'Saving...' : 'Save Pricing'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* MANDATORY BASE DECOR PRICING */}
              <div className="bg-[#FAF6F0] p-6 rounded-2xl border border-[#6B0D24]/10 space-y-4">
                <h4 className="text-sm font-black text-[#6B0D24] flex items-center gap-2">
                  <i className="ph-fill ph-check-circle"></i> Mandatory Base Decor Pricing
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Base Decor (Up to 3 Events) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        type="number"
                        value={pricingFormData.core_base_decor_3_events || ''}
                        onChange={(e) => handlePriceChange('core_base_decor_3_events', e.target.value)}
                        placeholder="500000"
                        className="w-full pl-8 p-3 rounded-xl border border-gray-200 bg-white font-bold text-gray-900 text-xs outline-none focus:border-[#6B0D24]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Add-on Decor (Per Event &gt; 3) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                        ₹
                      </span>
                      <input
                        type="number"
                        value={pricingFormData.core_addon_decor_per_event || ''}
                        onChange={(e) => handlePriceChange('core_addon_decor_per_event', e.target.value)}
                        placeholder="150000"
                        className="w-full pl-8 p-3 rounded-xl border border-gray-200 bg-white font-bold text-gray-900 text-xs outline-none focus:border-[#6B0D24]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* RECURSIVE MASTER CATALOG FORM NODES */}
              {renderSchemaNodes(masterCatalogSchema)}
            </div>
          </div>
        </div>
      )}

      {/* CLONE / COPY PRICING MODAL */}
      {copyModalOpen && (
        <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-xs z-[200000] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-lg text-gray-900">Clone Planner Pricing</h3>
                <p className="text-xs text-gray-500 font-medium">
                  Pick another resort where this planner is already priced.
                </p>
              </div>
              <button
                onClick={() => setCopyModalOpen(false)}
                className="text-gray-400 hover:text-red-600 font-bold text-lg"
              >
                ✖
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Source Resort
                </label>
                {loadingSources ? (
                  <div className="text-xs text-gray-400 font-bold">Searching existing pricing...</div>
                ) : (
                  <select
                    value={selectedSourcePairId}
                    onChange={(e) => setSelectedSourcePairId(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-300 font-bold text-gray-900 text-xs outline-none focus:border-[#6B0D24]"
                  >
                    <option value="">-- Choose Source Resort --</option>
                    {sourceResortsList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Price Adjustment (%)
                </label>
                <input
                  type="number"
                  value={priceAdjustmentPercent}
                  onChange={(e) => setPriceAdjustmentPercent(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 10 for +10%, -5 for -5%"
                  className="w-full p-3 rounded-xl border border-gray-300 font-bold text-gray-900 text-xs outline-none focus:border-[#6B0D24]"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Use 0 for exact copy. Positive number to increase, negative to decrease.
                </p>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={() => setCopyModalOpen(false)}
                className="flex-1 py-3 font-bold text-gray-500 hover:text-gray-700 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCopy}
                className="flex-1 bg-[#6B0D24] text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#520a1a] shadow-md"
              >
                Apply & Fill Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}