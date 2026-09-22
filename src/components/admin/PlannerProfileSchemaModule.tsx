'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SchemaField {
  id: string;
  type: 'field';
  name: string;
  fieldType: 'text' | 'long_text' | 'url' | 'dropdown' | 'checkbox' | 'image' | 'image_grid' | 'number';
  isFilter?: boolean;
  options?: string;
}

interface SchemaSubCategory {
  id: string;
  type: 'subcategory';
  name: string;
  isFilter?: boolean;
  isRepeatable?: boolean;
  items: SchemaField[];
}

interface SchemaCategory {
  id: string;
  type: 'category';
  name: string;
  isFilter?: boolean;
  isRepeatable?: boolean;
  items: (SchemaSubCategory | SchemaField)[];
}

const FIELD_TYPES = [
  { val: 'text', label: 'Short Text' },
  { val: 'long_text', label: 'Long Text (Bio)' },
  { val: 'url', label: 'URL / Link' },
  { val: 'dropdown', label: 'Dropdown Select' },
  { val: 'checkbox', label: 'Checkbox (Options / Yes-No)' },
  { val: 'image', label: 'Single Image' },
  { val: 'image_grid', label: 'Image Grid / Gallery' },
  { val: 'number', label: 'Number (e.g. Years Exp)' },
];

export default function PlannerProfileSchemaModule() {
  const [schema, setSchema] = useState<SchemaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Loading profile schema...');

  // Helper to generate IDs
  const generateId = () => 'id_' + Math.random().toString(36).substring(2, 9);

  // --- LOAD FROM FIREBASE ---
  const loadSchema = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'schemas', 'planner_profile_schema'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSchema(data.structure || []);
        setStatusMsg('Profile Schema Loaded Successfully.');
      } else {
        setSchema([]);
        setStatusMsg('No existing profile schema found. Ready to build.');
      }
    } catch (err: any) {
      console.error('Error loading profile schema:', err);
      setStatusMsg('Failed to load profile schema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchema();
  }, []);

  // --- SAVE TO FIREBASE ---
  const saveSchemaToFirebase = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'schemas', 'planner_profile_schema'), {
        structure: schema,
        updated_at: new Date().toISOString(),
      });
      alert('✅ Success! Planner Profile Schema saved live to Firebase.');
      setStatusMsg('Schema saved at ' + new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Save Schema Error:', err);
      alert('❌ Failed to save schema: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- IMMUTABLE STATE MUTATORS ---
  const addCategory = () => {
    const name = prompt('Enter Section Name (e.g., Team Details, Policies, Pricing):');
    if (!name || !name.trim()) return;
    const newCat: SchemaCategory = {
      id: generateId(),
      type: 'category',
      name: name.trim(),
      isFilter: false,
      isRepeatable: false,
      items: [],
    };
    setSchema([...schema, newCat]);
  };

  const addSubCategory = (cIdx: number) => {
    const name = prompt('Enter Sub-section Name:');
    if (!name || !name.trim()) return;
    const updated = [...schema];
    const newSub: SchemaSubCategory = {
      id: generateId(),
      type: 'subcategory',
      name: name.trim(),
      isFilter: false,
      isRepeatable: false,
      items: [],
    };
    updated[cIdx].items.push(newSub);
    setSchema(updated);
  };

  const addField = (cIdx: number, sIdx: number | null = null) => {
    const name = prompt('Enter Profile Field Name:');
    if (!name || !name.trim()) return;

    const newField: SchemaField = {
      id: generateId(),
      type: 'field',
      name: name.trim(),
      fieldType: 'text',
      isFilter: false,
      options: '',
    };

    const updated = [...schema];
    if (sIdx !== null) {
      const sub = updated[cIdx].items[sIdx] as SchemaSubCategory;
      sub.items.push(newField);
    } else {
      updated[cIdx].items.push(newField);
    }
    setSchema(updated);
  };

  const renameItem = (cIdx: number, sIdx: number | null = null, fIdx: number | null = null) => {
    const name = prompt('Enter new name:');
    if (!name || !name.trim()) return;

    const updated = [...schema];
    if (sIdx === null && fIdx === null) {
      updated[cIdx].name = name.trim();
    } else if (fIdx === null && sIdx !== null) {
      updated[cIdx].items[sIdx].name = name.trim();
    } else if (sIdx !== null && fIdx !== null) {
      const sub = updated[cIdx].items[sIdx] as SchemaSubCategory;
      sub.items[fIdx].name = name.trim();
    }
    setSchema(updated);
  };

  const deleteCategory = (cIdx: number) => {
    if (!confirm('Are you sure you want to delete this section?')) return;
    setSchema(schema.filter((_, idx) => idx !== cIdx));
  };

  const deleteSubCategory = (cIdx: number, sIdx: number) => {
    if (!confirm('Delete this sub-section?')) return;
    const updated = [...schema];
    updated[cIdx].items = updated[cIdx].items.filter((_, idx) => idx !== sIdx);
    setSchema(updated);
  };

  const deleteField = (cIdx: number, sIdx: number | null, fIdx: number) => {
    if (!confirm('Delete this field?')) return;
    const updated = [...schema];
    if (sIdx !== null) {
      const sub = updated[cIdx].items[sIdx] as SchemaSubCategory;
      sub.items = sub.items.filter((_, idx) => idx !== fIdx);
    } else {
      updated[cIdx].items = updated[cIdx].items.filter((_, idx) => idx !== fIdx);
    }
    setSchema(updated);
  };

  const updateCategoryProp = (cIdx: number, prop: keyof SchemaCategory, val: any) => {
    const updated = [...schema];
    (updated[cIdx] as any)[prop] = val;
    setSchema(updated);
  };

  const updateSubCategoryProp = (cIdx: number, sIdx: number, prop: keyof SchemaSubCategory, val: any) => {
    const updated = [...schema];
    (updated[cIdx].items[sIdx] as any)[prop] = val;
    setSchema(updated);
  };

  const updateFieldProp = (cIdx: number, sIdx: number | null, fIdx: number, prop: keyof SchemaField, val: any) => {
    const updated = [...schema];
    if (sIdx !== null) {
      const sub = updated[cIdx].items[sIdx] as SchemaSubCategory;
      (sub.items[fIdx] as any)[prop] = val;
    } else {
      (updated[cIdx].items[fIdx] as any)[prop] = val;
    }
    setSchema(updated);
  };

  const moveCategory = (cIdx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? cIdx - 1 : cIdx + 1;
    if (newIdx < 0 || newIdx >= schema.length) return;
    const updated = [...schema];
    [updated[cIdx], updated[newIdx]] = [updated[newIdx], updated[cIdx]];
    setSchema(updated);
  };

  const moveItemInCategory = (cIdx: number, iIdx: number, direction: 'up' | 'down') => {
    const items = schema[cIdx].items;
    const newIdx = direction === 'up' ? iIdx - 1 : iIdx + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    const updated = [...schema];
    [updated[cIdx].items[iIdx], updated[cIdx].items[newIdx]] = [
      updated[cIdx].items[newIdx],
      updated[cIdx].items[iIdx],
    ];
    setSchema(updated);
  };

  const moveFieldInSubCategory = (cIdx: number, sIdx: number, fIdx: number, direction: 'up' | 'down') => {
    const sub = schema[cIdx].items[sIdx] as SchemaSubCategory;
    const newIdx = direction === 'up' ? fIdx - 1 : fIdx + 1;
    if (newIdx < 0 || newIdx >= sub.items.length) return;
    const updated = [...schema];
    const targetSub = updated[cIdx].items[sIdx] as SchemaSubCategory;
    [targetSub.items[fIdx], targetSub.items[newIdx]] = [targetSub.items[newIdx], targetSub.items[fIdx]];
    setSchema(updated);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* TOP SECTION: FIXED CORE FIELDS BANNER */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden shrink-0">
        <div className="p-4 bg-purple-900 text-white flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-base font-black tracking-wide flex items-center gap-2">
              <i className="ph-bold ph-users text-lg text-purple-200"></i>
              <span>Planner Profile Schema</span>
            </h2>
            <p className="text-xs text-purple-200 mt-0.5">Define Planner Identity Fields &amp; Dynamic Profile Sections</p>
          </div>

          <button
            onClick={saveSchemaToFirebase}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-xl shadow-xs transition flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
          >
            <i className="ph-bold ph-cloud-arrow-up text-base"></i>
            <span>{saving ? 'Saving...' : 'Save Profile Schema'}</span>
          </button>
        </div>

        {/* CORE FIXED FIELDS HORIZONTAL/GRID BAR */}
        <div className="p-3.5 bg-gray-50/80 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-900">
              📌 Fixed Core Fields (Always Included)
            </span>
            <span className="text-[11px] text-gray-500 font-medium hidden md:inline">
              These identity fields are fixed at the top of every planner entry form.
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <div className="bg-white border border-gray-200 rounded-xl p-2 flex items-center gap-2 text-xs font-bold text-gray-800 shadow-2xs">
              <i className="ph-bold ph-buildings text-purple-600 text-base shrink-0"></i>
              <span className="truncate">Company / Brand Name</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-2 flex items-center gap-2 text-xs font-bold text-gray-800 shadow-2xs">
              <i className="ph-bold ph-instagram-logo text-pink-500 text-base shrink-0"></i>
              <span className="truncate">Instagram ID / Socials</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-2 flex items-center gap-2 text-xs font-bold text-gray-800 shadow-2xs">
              <i className="ph-bold ph-images text-blue-500 text-base shrink-0"></i>
              <span className="truncate">Portfolio Gallery</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-2 flex items-center gap-2 text-xs font-bold text-gray-800 shadow-2xs">
              <i className="ph-bold ph-sparkle text-amber-500 text-base shrink-0"></i>
              <span className="truncate">Key Features & Bio</span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-2 flex items-center gap-2 text-xs font-bold text-gray-800 shadow-2xs col-span-2 sm:col-span-1">
              <i className="ph-bold ph-eye-slash text-red-500 text-base shrink-0"></i>
              <span className="truncate">Hide / Draft Status</span>
            </div>
          </div>
        </div>
      </div>

      {/* INDIVIDUAL SCROLLABLE CANVAS CONTAINER */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-5 overflow-y-auto space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-lg font-black text-gray-900">Dynamic Profile Sections</h3>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{statusMsg}</p>
          </div>

          <button
            onClick={addCategory}
            className="bg-purple-700 hover:bg-purple-800 text-white font-bold py-2 px-4 rounded-xl shadow-xs flex items-center gap-2 text-xs uppercase tracking-wider transition cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <i className="ph-bold ph-folder-plus text-base"></i>
            <span>Add Profile Section</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
            <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-purple-700 block mx-auto"></i>
            Loading profile schema...
          </div>
        ) : schema.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs font-bold uppercase tracking-wider">
            No profile sections added yet. Click &quot;Add Profile Section&quot; to begin.
          </div>
        ) : (
          <div className="space-y-6 pb-6">
            {schema.map((cat, cIdx) => (
              <div
                key={cat.id}
                className="bg-white border-t-4 border-purple-700 rounded-2xl border-x border-b border-gray-200 shadow-xs overflow-hidden"
              >
                {/* SECTION HEADER */}
                <div className="bg-gray-50/80 px-4 py-3 flex flex-wrap justify-between items-center border-b border-gray-200 gap-2">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-black text-gray-900">{cat.name}</h4>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={!!cat.isRepeatable}
                        onChange={(e) => updateCategoryProp(cIdx, 'isRepeatable', e.target.checked)}
                        className="rounded text-purple-700"
                      />
                      <span>Allow Duplication</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveCategory(cIdx, 'up')}
                      disabled={cIdx === 0}
                      className="p-1.5 text-gray-500 hover:text-black disabled:opacity-30"
                      title="Move Up"
                    >
                      <i className="ph-bold ph-caret-up text-base"></i>
                    </button>
                    <button
                      onClick={() => moveCategory(cIdx, 'down')}
                      disabled={cIdx === schema.length - 1}
                      className="p-1.5 text-gray-500 hover:text-black disabled:opacity-30"
                      title="Move Down"
                    >
                      <i className="ph-bold ph-caret-down text-base"></i>
                    </button>
                    <button
                      onClick={() => renameItem(cIdx)}
                      className="p-1.5 text-purple-700 hover:text-purple-900"
                      title="Rename"
                    >
                      <i className="ph-bold ph-pencil-simple text-base"></i>
                    </button>
                    <button
                      onClick={() => deleteCategory(cIdx)}
                      className="p-1.5 text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      <i className="ph-bold ph-trash text-base"></i>
                    </button>
                  </div>
                </div>

                {/* SECTION BODY */}
                <div className="p-4 space-y-4">
                  {cat.items.map((item, iIdx) =>
                    item.type === 'subcategory' ? (
                      /* SUB-CATEGORY ITEM */
                      <div
                        key={item.id}
                        className="ml-2 sm:ml-6 border-l-4 border-pink-500 bg-white border border-gray-200 rounded-r-xl shadow-2xs overflow-hidden"
                      >
                        <div className="bg-gray-50 px-3 py-2 flex justify-between items-center border-b border-gray-200 gap-2">
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-gray-800 text-xs sm:text-sm">{item.name}</h5>
                            <label className="flex items-center gap-1 text-[11px] text-gray-500 bg-white border px-2 py-0.5 rounded">
                              <input
                                type="checkbox"
                                checked={!!item.isRepeatable}
                                onChange={(e) => updateSubCategoryProp(cIdx, iIdx, 'isRepeatable', e.target.checked)}
                              />
                              <span>Duplicate</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <button
                              onClick={() => moveItemInCategory(cIdx, iIdx, 'up')}
                              disabled={iIdx === 0}
                              className="p-1 text-gray-500 disabled:opacity-30"
                            >
                              <i className="ph-bold ph-caret-up"></i>
                            </button>
                            <button
                              onClick={() => moveItemInCategory(cIdx, iIdx, 'down')}
                              disabled={iIdx === cat.items.length - 1}
                              className="p-1 text-gray-500 disabled:opacity-30"
                            >
                              <i className="ph-bold ph-caret-down"></i>
                            </button>
                            <button
                              onClick={() => renameItem(cIdx, iIdx)}
                              className="p-1 text-purple-700 hover:text-purple-900"
                            >
                              <i className="ph-bold ph-pencil-simple"></i>
                            </button>
                            <button
                              onClick={() => deleteSubCategory(cIdx, iIdx)}
                              className="p-1 text-red-500 hover:text-red-700"
                            >
                              <i className="ph-bold ph-trash"></i>
                            </button>
                          </div>
                        </div>

                        {/* SUB-CATEGORY FIELDS */}
                        <div className="p-3 space-y-2 bg-gray-50/40">
                          {item.items.map((field, fIdx) => (
                            <div
                              key={field.id}
                              className="flex items-center justify-between bg-white border border-gray-200 p-2.5 rounded-xl shadow-2xs gap-2 flex-wrap"
                            >
                              <div className="flex items-center gap-2 flex-1 flex-wrap min-w-[240px]">
                                <span
                                  className="font-bold text-xs text-gray-800 min-w-[120px] max-w-[180px] truncate"
                                  title={field.name}
                                >
                                  {field.name}
                                </span>

                                <select
                                  value={field.fieldType}
                                  onChange={(e) =>
                                    updateFieldProp(
                                      cIdx,
                                      iIdx,
                                      fIdx,
                                      'fieldType',
                                      e.target.value as SchemaField['fieldType']
                                    )
                                  }
                                  className="text-xs font-bold border border-gray-200 rounded-lg p-1.5 bg-gray-50 outline-none"
                                >
                                  {FIELD_TYPES.map((ft) => (
                                    <option key={ft.val} value={ft.val}>
                                      {ft.label}
                                    </option>
                                  ))}
                                </select>

                                {(field.fieldType === 'dropdown' || field.fieldType === 'checkbox') && (
                                  <input
                                    type="text"
                                    value={field.options || ''}
                                    onChange={(e) => updateFieldProp(cIdx, iIdx, fIdx, 'options', e.target.value)}
                                    placeholder="Options (comma separated)"
                                    className="text-xs border border-purple-300 bg-purple-50 text-purple-900 rounded-lg p-1.5 min-w-[160px] outline-none"
                                  />
                                )}

                                <label className="flex items-center gap-1 text-[11px] text-gray-500 ml-2">
                                  <input
                                    type="checkbox"
                                    checked={!!field.isFilter}
                                    onChange={(e) => updateFieldProp(cIdx, iIdx, fIdx, 'isFilter', e.target.checked)}
                                  />
                                  <span>Search Filter</span>
                                </label>
                              </div>

                              <div className="flex items-center gap-1 text-xs shrink-0">
                                <button
                                  onClick={() => moveFieldInSubCategory(cIdx, iIdx, fIdx, 'up')}
                                  disabled={fIdx === 0}
                                  className="p-1 text-gray-500 disabled:opacity-30"
                                >
                                  <i className="ph-bold ph-caret-up"></i>
                                </button>
                                <button
                                  onClick={() => moveFieldInSubCategory(cIdx, iIdx, fIdx, 'down')}
                                  disabled={fIdx === item.items.length - 1}
                                  className="p-1 text-gray-500 disabled:opacity-30"
                                >
                                  <i className="ph-bold ph-caret-down"></i>
                                </button>
                                <button
                                  onClick={() => renameItem(cIdx, iIdx, fIdx)}
                                  className="p-1 text-purple-700 hover:text-purple-900"
                                >
                                  <i className="ph-bold ph-pencil-simple"></i>
                                </button>
                                <button
                                  onClick={() => deleteField(cIdx, iIdx, fIdx)}
                                  className="p-1 text-red-500 hover:text-red-700"
                                >
                                  <i className="ph-bold ph-trash"></i>
                                </button>
                              </div>
                            </div>
                          ))}

                          <div className="pt-1">
                            <button
                              onClick={() => addField(cIdx, iIdx)}
                              className="text-xs font-bold bg-white text-gray-700 hover:bg-gray-100 py-1.5 px-3 rounded-lg border border-gray-300 transition cursor-pointer"
                            >
                              + Add Field
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* DIRECT FIELD UNDER CATEGORY */
                      <div
                        key={item.id}
                        className="ml-2 sm:ml-6 flex items-center justify-between bg-white border border-gray-200 p-2.5 rounded-xl shadow-2xs gap-2 flex-wrap"
                      >
                        <div className="flex items-center gap-2 flex-1 flex-wrap min-w-[240px]">
                          <span
                            className="font-bold text-xs text-gray-800 min-w-[120px] max-w-[180px] truncate"
                            title={item.name}
                          >
                            {item.name}
                          </span>

                          <select
                            value={item.fieldType}
                            onChange={(e) =>
                              updateFieldProp(
                                cIdx,
                                null,
                                iIdx,
                                'fieldType',
                                e.target.value as SchemaField['fieldType']
                              )
                            }
                            className="text-xs font-bold border border-gray-200 rounded-lg p-1.5 bg-gray-50 outline-none"
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft.val} value={ft.val}>
                                {ft.label}
                              </option>
                            ))}
                          </select>

                          {(item.fieldType === 'dropdown' || item.fieldType === 'checkbox') && (
                            <input
                              type="text"
                              value={item.options || ''}
                              onChange={(e) => updateFieldProp(cIdx, null, iIdx, 'options', e.target.value)}
                              placeholder="Options (comma separated)"
                              className="text-xs border border-purple-300 bg-purple-50 text-purple-900 rounded-lg p-1.5 min-w-[160px] outline-none"
                            />
                          )}

                          <label className="flex items-center gap-1 text-[11px] text-gray-500 ml-2">
                            <input
                              type="checkbox"
                              checked={!!item.isFilter}
                              onChange={(e) => updateFieldProp(cIdx, null, iIdx, 'isFilter', e.target.checked)}
                            />
                            <span>Search Filter</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-1 text-xs shrink-0">
                          <button
                            onClick={() => moveItemInCategory(cIdx, iIdx, 'up')}
                            disabled={iIdx === 0}
                            className="p-1 text-gray-500 disabled:opacity-30"
                          >
                            <i className="ph-bold ph-caret-up"></i>
                          </button>
                          <button
                            onClick={() => moveItemInCategory(cIdx, iIdx, 'down')}
                            disabled={iIdx === cat.items.length - 1}
                            className="p-1 text-gray-500 disabled:opacity-30"
                          >
                            <i className="ph-bold ph-caret-down"></i>
                          </button>
                          <button
                            onClick={() => renameItem(cIdx, null, iIdx)}
                            className="p-1 text-purple-700 hover:text-purple-900"
                          >
                            <i className="ph-bold ph-pencil-simple"></i>
                          </button>
                          <button
                            onClick={() => deleteField(cIdx, null, iIdx)}
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            <i className="ph-bold ph-trash"></i>
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => addSubCategory(cIdx)}
                      className="text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 py-1.5 px-3 rounded-lg border border-purple-200 transition cursor-pointer"
                    >
                      + Add Sub-section
                    </button>
                    <button
                      onClick={() => addField(cIdx)}
                      className="text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-lg border border-gray-300 transition cursor-pointer"
                    >
                      + Add Profile Field
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}