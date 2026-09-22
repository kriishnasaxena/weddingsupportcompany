'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

const CONFIG: Record<string, { schemaDoc: string; dataColl: string; label: string }> = {
  resorts: { schemaDoc: 'resort_schema', dataColl: 'resort_data', label: 'Resorts' },
  planners: { schemaDoc: 'planner_profile_schema', dataColl: 'planner_data', label: 'Planners' },
  catalogs: { schemaDoc: 'master_catalog_schema', dataColl: 'catalog_data', label: 'Catalogs' },
};

export default function DataEntryModule() {
  const [activeEntity, setActiveEntity] = useState<'resorts' | 'planners' | 'catalogs'>('resorts');
  const [records, setRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  // Form & Schema State
  const [currentSchema, setCurrentSchema] = useState<any[]>([]);
  const [currentEditingId, setCurrentEditingId] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [repeatCounts, setRepeatCounts] = useState<Record<string, number>>({});
  const [calendarRules, setCalendarRules] = useState<any[]>([]);
  const [fileInputs, setFileInputs] = useState<Record<string, FileList | null>>({});

  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Fetch Schema and Records for active entity
  const loadEntityData = async () => {
    setLoadingRecords(true);
    try {
      // 1. Fetch Schema Structure
      const schemaRef = doc(db, 'schemas', CONFIG[activeEntity].schemaDoc);
      const schemaSnap = await getDoc(schemaRef);
      const schemaTree = schemaSnap.exists() ? schemaSnap.data().structure || [] : [];
      setCurrentSchema(schemaTree);

      // 2. Fetch Collection Records
      const snap = await getDocs(collection(db, CONFIG[activeEntity].dataColl));
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });

      // Sort newest or by name
      list.sort((a, b) => {
        const nameA = a._recordName || a.id;
        const nameB = b._recordName || b.id;
        return String(nameA).localeCompare(String(nameB));
      });

      setRecords(list);
    } catch (err) {
      console.error('Error loading entity data:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadEntityData();
  }, [activeEntity]);

  // Open Create / Edit Modal
  const handleOpenModal = (existingRecord: any = null) => {
    const existing = existingRecord || {};
    setCurrentEditingId(existing.id || null);
    setFormData(JSON.parse(JSON.stringify(existing)));
    setRepeatCounts({});
    setFileInputs({});
    setCalendarRules(existing.core_calendar || []);
    setUploadStatus(null);
    setFormModalOpen(true);
  };

  // Close Modal
  const handleCloseModal = () => {
    setFormModalOpen(false);
    setFormData({});
    setFileInputs({});
  };

  // Form Field Change Handler
  const handleFieldChange = (fieldId: string, val: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: val,
    }));
  };

  // File Input Handler
  const handleFileChange = (fieldId: string, files: FileList | null) => {
    setFileInputs((prev) => ({
      ...prev,
      [fieldId]: files,
    }));
  };

  // Repeatable Field Counter
  const addRepeatable = (trackKey: string) => {
    setRepeatCounts((prev) => ({
      ...prev,
      [trackKey]: (prev[trackKey] || 1) + 1,
    }));
  };

  const removeRepeatable = (trackKey: string, index: number) => {
    if (!confirm('Are you sure you want to remove this instance?')) return;
    setRepeatCounts((prev) => ({
      ...prev,
      [trackKey]: Math.max(1, (prev[trackKey] || 1) - 1),
    }));
  };

  // Calendar Rule Actions
  const addCalendarRule = () => {
    setCalendarRules((prev) => [
      ...prev,
      { dateType: 'range', startDate: '', endDate: '', adjustmentType: 'discount_percent', value: 0 },
    ]);
  };

  const removeCalendarRule = (idx: number) => {
    setCalendarRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCalendarRule = (idx: number, field: string, val: any) => {
    setCalendarRules((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  // Upload file helper
  const uploadSingleFile = async (file: File, path: string) => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  // SAVE RECORD TO FIRESTORE
  const handleSaveRecord = async () => {
    setSaving(true);
    setUploadStatus('Uploading images & saving data to Firestore...');

    try {
      const recordId = currentEditingId || 'REC_' + Date.now();
      const dataToSave: Record<string, any> = { ...formData };

      // Set Display Name
      dataToSave._recordName =
        activeEntity !== 'catalogs'
          ? formData._recordName || 'Unnamed Record'
          : 'Master Catalog Pricing Data';

      // Core Resort Fields
      if (activeEntity === 'resorts') {
        dataToSave.core_calendar = calendarRules;
      }

      // Upload Core Planner Portfolio Files
      if (activeEntity === 'planners' && fileInputs['core_portfolio']) {
        const files = fileInputs['core_portfolio'];
        if (files && files.length > 0) {
          const urls: string[] = [];
          for (let i = 0; i < files.length; i++) {
            const url = await uploadSingleFile(
              files[i],
              `uploads/${recordId}/portfolio_${Date.now()}_${files[i].name}`
            );
            urls.push(url);
          }
          dataToSave.core_portfolio = urls.join(', ');
        }
      }

      // Process Schema File Uploads
      for (const [fieldId, files] of Object.entries(fileInputs)) {
        if (fieldId === 'core_portfolio') continue;
        if (files && files.length > 0) {
          const urls: string[] = [];
          for (let i = 0; i < files.length; i++) {
            const url = await uploadSingleFile(
              files[i],
              `uploads/${recordId}/${fieldId}_${Date.now()}_${files[i].name}`
            );
            urls.push(url);
          }
          dataToSave[fieldId] = urls.join(', ');
        }
      }

      dataToSave.updatedAt = new Date().toISOString();

      // Save to Firestore
      await setDoc(doc(db, CONFIG[activeEntity].dataColl, recordId), dataToSave);

      handleCloseModal();
      await loadEntityData();
    } catch (err: any) {
      console.error('Error saving record:', err);
      alert('Error saving: ' + (err.message || 'Failed to save record.'));
    } finally {
      setSaving(false);
      setUploadStatus(null);
    }
  };

  // DELETE RECORD
  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record from database?')) return;
    try {
      await deleteDoc(doc(db, CONFIG[activeEntity].dataColl, id));
      await loadEntityData();
    } catch (err: any) {
      alert('Error deleting record: ' + err.message);
    }
  };

  // RECURSIVE SCHEMA UI RENDERER
  const renderSchemaNodes = (nodes: any[], parentSuffix = ''): React.ReactNode => {
    if (!Array.isArray(nodes)) return null;

    return nodes.map((node) => {
      const isRep = node.isRepeatable === true || node.isRepeatable === 'true';
      const trackKey = node.id + parentSuffix;

      const count = isRep ? repeatCounts[trackKey] || formData[`${trackKey}_count`] || 1 : 1;
      const instances = [];

      for (let i = 0; i < count; i++) {
        const currentSuffix = isRep ? `${parentSuffix}_${i}` : parentSuffix;
        const actualId = node.id + currentSuffix;

        const children = node.items ? renderSchemaNodes(node.items, currentSuffix) : null;

        if (
          node.type === 'category' ||
          node.type === 'subcategory' ||
          node.type === 'general' ||
          node.type === 'event'
        ) {
          const isCategoryHeader =
            node.type === 'category' || node.type === 'general' || node.type === 'event';
          instances.push(
            <div key={actualId} className={isRep ? 'border-l-4 border-blue-400 pl-4 py-3 my-3 bg-gray-50/60 rounded-r-xl relative' : ''}>
              {isRep && i > 0 && (
                <button
                  type="button"
                  onClick={() => removeRepeatable(trackKey, i)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-xs font-bold"
                >
                  <i className="ph ph-trash"></i> Remove
                </button>
              )}
              <h3
                className={
                  isCategoryHeader
                    ? 'text-lg font-black text-gray-900 mt-6 mb-3 border-b border-gray-200 pb-2'
                    : 'text-sm font-bold text-gray-700 mt-4 mb-2 border-b border-gray-100 pb-1'
                }
              >
                {node.name} {isRep ? `#${i + 1}` : ''}
              </h3>
              {children}
            </div>
          );
        } else if (node.type === 'field') {
          const val = formData[actualId] !== undefined ? formData[actualId] : '';

          let inputElement: React.ReactNode = null;

          if (node.fieldType === 'dimension_2d') {
            const valL = formData[`${actualId}_L`] || '';
            const valB = formData[`${actualId}_B`] || '';
            inputElement = (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={valL}
                  onChange={(e) => handleFieldChange(`${actualId}_L`, Number(e.target.value))}
                  placeholder="Length (ft)"
                  className="w-full p-2.5 rounded-xl bg-white border border-gray-300 text-xs font-bold"
                />
                <span className="font-black text-gray-400">X</span>
                <input
                  type="number"
                  value={valB}
                  onChange={(e) => handleFieldChange(`${actualId}_B`, Number(e.target.value))}
                  placeholder="Breadth (ft)"
                  className="w-full p-2.5 rounded-xl bg-white border border-gray-300 text-xs font-bold"
                />
              </div>
            );
          } else if (node.fieldType === 'image' || node.fieldType === 'image_grid') {
            inputElement = (
              <div>
                <input
                  type="file"
                  accept="image/*"
                  multiple={node.fieldType === 'image_grid'}
                  onChange={(e) => handleFileChange(actualId, e.target.files)}
                  className="w-full p-2 rounded-xl bg-white border border-gray-300 text-xs"
                />
                {val && (
                  <span className="text-[10px] text-green-600 font-bold block mt-1 truncate">
                    ✓ Current: {typeof val === 'string' ? val.substring(0, 40) + '...' : 'Saved'}
                  </span>
                )}
              </div>
            );
          } else if (node.fieldType === 'long_text') {
            inputElement = (
              <textarea
                value={val}
                onChange={(e) => handleFieldChange(actualId, e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-white border border-gray-300 text-xs font-medium"
              />
            );
          } else if (node.fieldType === 'dropdown' || node.fieldType === 'checkbox') {
            const opts = node.options ? node.options.split(',').map((o: string) => o.trim()) : [];
            inputElement = (
              <select
                value={val}
                onChange={(e) => handleFieldChange(actualId, e.target.value)}
                className="w-full p-3 rounded-xl bg-white border border-gray-300 text-xs font-bold"
              >
                <option value="">-- Select --</option>
                {opts.map((o: string) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          } else {
            const typeAttr =
              node.fieldType === 'number' || node.fieldType === 'rupees' || node.fieldType === 'percentage'
                ? 'number'
                : 'text';
            inputElement = (
              <input
                type={typeAttr}
                value={val}
                onChange={(e) =>
                  handleFieldChange(actualId, typeAttr === 'number' ? Number(e.target.value) : e.target.value)
                }
                className="w-full p-3 rounded-xl bg-white border border-gray-300 text-xs font-bold"
              />
            );
          }

          instances.push(
            <div key={actualId} className="mb-4">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                <span>{node.name}</span>
                <span className="text-gray-300 font-normal lowercase">{node.fieldType}</span>
              </label>
              {inputElement}
            </div>
          );
        } else if (node.pricingRule) {
          const val = formData[actualId] !== undefined ? formData[actualId] : '';
          instances.push(
            <div
              key={actualId}
              className="mb-3 flex items-center justify-between bg-white p-3 border border-gray-200 rounded-2xl shadow-2xs"
            >
              <div className="flex items-center gap-3">
                {node.thumbnail ? (
                  <img src={node.thumbnail} alt={node.name} className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                    <i className="ph ph-image"></i>
                  </div>
                )}
                <div>
                  <p className="font-bold text-gray-800 text-xs">{node.name}</p>
                  <p className="text-[10px] text-teal-600 font-bold uppercase">
                    {node.pricingRule.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="w-40">
                <input
                  type="number"
                  value={val}
                  onChange={(e) => handleFieldChange(actualId, Number(e.target.value))}
                  placeholder="Cost (₹)"
                  className="w-full p-2 rounded-xl bg-gray-50 border border-gray-300 text-right font-black text-xs text-gray-900"
                />
              </div>
            </div>
          );
        }
      }

      if (isRep) {
        return (
          <div key={node.id} className="mb-6">
            {instances}
            <button
              type="button"
              onClick={() => addRepeatable(trackKey)}
              className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5"
            >
              <i className="ph ph-plus-circle"></i> Add Another {node.name}
            </button>
          </div>
        );
      }

      return <React.Fragment key={node.id}>{instances}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-4 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph ph-database text-[#6B0D24]"></i> Universal Data Manager
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Fill, edit, and manage records based on custom schemas.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">
            Module:
          </label>
          <select
            value={activeEntity}
            onChange={(e) => setActiveEntity(e.target.value as any)}
            className="p-2 rounded-xl bg-white border border-gray-300 font-bold outline-none focus:border-[#6B0D24] text-xs text-gray-900 cursor-pointer"
          >
            <option value="resorts">🏢 Manage Resorts</option>
            <option value="planners">👩‍💼 Manage Planners</option>
            <option value="catalogs">🏷️ Manage Catalog Prices</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-2xs">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
            Saved {CONFIG[activeEntity].label} Records ({records.length})
          </h3>

          <button
            onClick={() => handleOpenModal()}
            className="bg-[#6B0D24] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#520a1a] transition flex items-center gap-1.5 shadow-2xs text-xs uppercase tracking-wider cursor-pointer"
          >
            <i className="ph ph-plus-circle text-base"></i> Add New Record
          </button>
        </div>

        <div className="overflow-x-auto">
          {loadingRecords ? (
            <div className="p-12 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
              <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-[#6B0D24] block mx-auto"></i>
              Loading Records...
            </div>
          ) : records.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-xs font-bold italic">
              No records found. Click "Add New Record" to create one.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                  <th className="p-4">Record Name / ID</th>
                  <th className="p-4">Last Updated</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {records.map((r) => {
                  const displayName =
                    r._recordName ||
                    (activeEntity === 'catalogs' ? 'Catalog Pricing Record' : r.id);
                  const dateStr = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : 'N/A';

                  return (
                    <tr key={r.id} className="hover:bg-stone-50 transition group">
                      <td className="p-4 font-bold text-gray-900">{displayName}</td>
                      <td className="p-4 text-gray-500">{dateStr}</td>
                      <td className="p-4 text-right space-x-3">
                        <button
                          onClick={() => handleOpenModal(r)}
                          className="text-[#6B0D24] font-bold hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(r.id)}
                          className="text-red-600 font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* DYNAMIC FORM MODAL */}
      {formModalOpen && (
        <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-xs flex items-center justify-center z-[200000] p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="text-base font-black text-gray-900 uppercase tracking-wider">
                {currentEditingId ? 'Edit Record' : 'Create New Record'} ({CONFIG[activeEntity].label})
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-red-600 font-bold text-xl transition"
              >
                ✖
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-white space-y-6 custom-scrollbar">
              {/* Record Name */}
              {activeEntity !== 'catalogs' && (
                <div className="bg-[#FAF6F0] p-5 rounded-2xl border border-[#6B0D24]/10">
                  <label className="block text-xs font-black text-[#6B0D24] uppercase tracking-widest mb-1.5">
                    Display Name for this Record
                  </label>
                  <input
                    type="text"
                    value={formData._recordName || ''}
                    onChange={(e) => handleFieldChange('_recordName', e.target.value)}
                    placeholder="e.g. Taj Aravali Resort OR Royal Planners"
                    className="w-full p-3 rounded-xl bg-white border border-gray-200 outline-none focus:border-[#6B0D24] font-bold text-sm"
                  />
                </div>
              )}

              {/* Core Resort Fields */}
              {activeEntity === 'resorts' && (
                <div className="space-y-4 border-b border-gray-100 pb-6">
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider border-b pb-2">
                    Core Resort Search Data
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-bold text-gray-500 uppercase mb-1">Location</label>
                      <input
                        type="text"
                        value={formData.core_location || ''}
                        onChange={(e) => handleFieldChange('core_location', e.target.value)}
                        placeholder="Udaipur, Rajasthan"
                        className="w-full p-2.5 rounded-xl border border-gray-300"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-gray-500 uppercase mb-1">Star Category</label>
                      <select
                        value={formData.core_star_rating || '4 Star'}
                        onChange={(e) => handleFieldChange('core_star_rating', e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-gray-300 font-bold"
                      >
                        <option value="5 Star">5 Star</option>
                        <option value="4 Star">4 Star</option>
                        <option value="3 Star">3 Star</option>
                        <option value="Heritage">Heritage Property</option>
                        <option value="Boutique">Boutique</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-500 uppercase mb-1">Total Rooms</label>
                      <input
                        type="number"
                        value={formData.core_rooms || ''}
                        onChange={(e) => handleFieldChange('core_rooms', Number(e.target.value))}
                        placeholder="120"
                        className="w-full p-2.5 rounded-xl border border-gray-300 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-gray-500 uppercase mb-1">Expert Rating</label>
                      <input
                        type="number"
                        step="0.1"
                        max="5"
                        value={formData.core_expert_rating || ''}
                        onChange={(e) => handleFieldChange('core_expert_rating', Number(e.target.value))}
                        placeholder="4.8"
                        className="w-full p-2.5 rounded-xl border border-gray-300 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-gray-500 uppercase mb-1">Address</label>
                      <textarea
                        value={formData.core_address || ''}
                        onChange={(e) => handleFieldChange('core_address', e.target.value)}
                        rows={2}
                        className="w-full p-2.5 rounded-xl border border-gray-300"
                      />
                    </div>

                    {/* Calendar Pricing Rules */}
                    <div className="sm:col-span-2 bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-black uppercase tracking-wider text-[#6B0D24]">
                          Calendar Pricing Rules
                        </label>
                        <button
                          type="button"
                          onClick={addCalendarRule}
                          className="text-xs bg-[#6B0D24] text-white font-bold px-3 py-1.5 rounded-xl hover:bg-[#520a1a]"
                        >
                          + Add Rule
                        </button>
                      </div>

                      <div className="space-y-2">
                        {calendarRules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-gray-200 text-xs"
                          >
                            <input
                              type="date"
                              value={rule.startDate || ''}
                              onChange={(e) => updateCalendarRule(idx, 'startDate', e.target.value)}
                              className="p-1.5 border rounded-lg"
                            />
                            <span>to</span>
                            <input
                              type="date"
                              value={rule.endDate || ''}
                              onChange={(e) => updateCalendarRule(idx, 'endDate', e.target.value)}
                              className="p-1.5 border rounded-lg"
                            />
                            <input
                              type="number"
                              value={rule.value || 0}
                              onChange={(e) => updateCalendarRule(idx, 'value', Number(e.target.value))}
                              placeholder="Discount %"
                              className="w-20 p-1.5 border rounded-lg font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => removeCalendarRule(idx)}
                              className="text-red-500 font-bold ml-auto"
                            >
                              ✖
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Schema Form Nodes */}
              <div className="space-y-4">{renderSchemaNodes(currentSchema)}</div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-between items-center">
              {uploadStatus && (
                <span className="text-xs font-bold text-[#6B0D24] animate-pulse">
                  {uploadStatus}
                </span>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-200 rounded-xl transition text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveRecord}
                  className="px-6 py-2.5 bg-[#6B0D24] hover:bg-[#520a1a] text-white font-bold rounded-xl shadow-md transition flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}