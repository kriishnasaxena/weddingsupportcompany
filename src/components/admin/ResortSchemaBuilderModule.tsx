'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const FIELD_TYPES = [
  { val: 'text', label: 'Short Text' },
  { val: 'long_text', label: 'Long Text' },
  { val: 'number', label: 'Number' },
  { val: 'rupees', label: 'Rupees (₹)' },
  { val: 'percentage', label: 'Percentage (%)' },
  { val: 'dimension_2d', label: 'Dimension (L x B)' },
  { val: 'dropdown', label: 'Dropdown Select' },
  { val: 'checkbox', label: 'Checkbox (Options / Yes-No)' },
  { val: 'image', label: 'Single Image' },
  { val: 'image_grid', label: 'Image Grid / Gallery' },
];

const CALC_TAGS = [
  { val: 'none', label: 'No Math (Info Only)' },
  { val: 'cond_min_guest', label: 'Condition: Min Guests' },
  { val: 'cond_max_guest', label: 'Condition: Max Guests' },
  { val: 'calc_base_price', label: 'Math: Multiply by Guests' },
  { val: 'calc_flat_fee', label: 'Math: Add Flat Fee' },
];

const generateId = () => 'id_' + Math.random().toString(36).substring(2, 11);

export default function ResortSchemaBuilderModule() {
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Schema from Firestore
  const loadSchemaFromFirebase = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'schemas', 'resort_schema'));
      if (docSnap.exists()) {
        setSchema(docSnap.data().structure || []);
      }
    } catch (err) {
      console.error('Error loading resort schema:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemaFromFirebase();
  }, []);

  // Save Schema to Firestore
  const handleSaveSchema = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      await setDoc(doc(db, 'schemas', 'resort_schema'), {
        structure: schema,
        updated_at: new Date().toISOString(),
      });
      setSaveMessage({ type: 'success', text: '✓ Resort Schema saved to database!' });
    } catch (err: any) {
      console.error('Error saving resort schema:', err);
      setSaveMessage({ type: 'error', text: err.message || 'Failed to save schema.' });
    } finally {
      setSaving(false);
    }
  };

  // CRUD Operations
  const handleAddCategory = () => {
    const name = prompt('Enter Category Name:');
    if (!name) return;
    setSchema((prev) => [
      ...prev,
      { id: generateId(), type: 'category', name: name.trim(), isFilter: false, isRepeatable: false, items: [] },
    ]);
  };

  const handleAddSubCategory = (cIdx: number) => {
    const name = prompt('Enter Sub-category Name:');
    if (!name) return;
    setSchema((prev) => {
      const updated = [...prev];
      updated[cIdx].items.push({
        id: generateId(),
        type: 'subcategory',
        name: name.trim(),
        isFilter: false,
        isRepeatable: false,
        items: [],
      });
      return updated;
    });
  };

  const handleAddField = (cIdx: number, sIdx: number | null = null) => {
    const name = prompt('Enter Field Name:');
    if (!name) return;
    const newField = {
      id: generateId(),
      type: 'field',
      name: name.trim(),
      fieldType: 'text',
      calcTag: 'none',
      isFilter: false,
      isRepeatable: false,
      options: '',
    };

    setSchema((prev) => {
      const updated = [...prev];
      if (sIdx !== null) {
        updated[cIdx].items[sIdx].items.push(newField);
      } else {
        updated[cIdx].items.push(newField);
      }
      return updated;
    });
  };

  const handleRenameItem = (cIdx: number, sIdx: number | null = null, fIdx: number | null = null) => {
    let currentName = '';
    if (fIdx !== null && sIdx !== null) currentName = schema[cIdx]?.items[sIdx]?.items[fIdx]?.name || '';
    else if (sIdx !== null) currentName = schema[cIdx]?.items[sIdx]?.name || '';
    else currentName = schema[cIdx]?.name || '';

    const newName = prompt('Enter new name:', currentName);
    if (!newName) return;

    setSchema((prev) => {
      const updated = [...prev];
      if (fIdx !== null && sIdx !== null) updated[cIdx].items[sIdx].items[fIdx].name = newName.trim();
      else if (sIdx !== null) updated[cIdx].items[sIdx].name = newName.trim();
      else updated[cIdx].name = newName.trim();
      return updated;
    });
  };

  const handleDeleteItem = (cIdx: number, sIdx: number | null = null, fIdx: number | null = null) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    setSchema((prev) => {
      const updated = [...prev];
      if (fIdx !== null && sIdx !== null) updated[cIdx].items[sIdx].items.splice(fIdx, 1);
      else if (sIdx !== null) updated[cIdx].items.splice(sIdx, 1);
      else updated.splice(cIdx, 1);
      return updated;
    });
  };

  const handleUpdateProperty = (
    cIdx: number,
    sIdx: number | null,
    fIdx: number | null,
    prop: string,
    val: any
  ) => {
    setSchema((prev) => {
      const updated = [...prev];
      if (fIdx !== null && sIdx !== null) updated[cIdx].items[sIdx].items[fIdx][prop] = val;
      else if (sIdx !== null) updated[cIdx].items[sIdx][prop] = val;
      else updated[cIdx][prop] = val;
      return updated;
    });
  };

  const handleMoveItem = (
    cIdx: number,
    sIdx: number | null,
    fIdx: number | null,
    direction: 'up' | 'down'
  ) => {
    setSchema((prev) => {
      const updated = [...prev];
      let arr: any[] = [];
      if (fIdx !== null && sIdx !== null) arr = updated[cIdx].items[sIdx].items;
      else if (sIdx !== null) arr = updated[cIdx].items;
      else arr = updated;

      const idx = fIdx !== null ? fIdx : sIdx !== null ? sIdx : cIdx;
      if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === arr.length - 1))
        return updated;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph ph-gear text-[#6B0D24]"></i> Resort Schema Builder
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Define dynamic hierarchy categories and data input fields for resorts.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleAddCategory}
            className="bg-[#6B0D24] text-white font-bold px-5 py-2.5 rounded-xl hover:bg-[#520a1a] transition shadow-xs text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <i className="ph ph-folder-plus text-base text-[#C5A059]"></i> Add Category
          </button>

          <button
            onClick={handleSaveSchema}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <i className="ph ph-cloud-arrow-up text-base"></i>
            {saving ? 'Saving...' : 'Save Schema to DB'}
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

      {/* SCHEMA BUILDER CANVAS (INTERNAL SCROLLABLE AREA) */}
<div className="w-full space-y-6 max-h-[calc(100vh-240px)] overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider bg-white rounded-3xl border border-gray-200">
            <i className="ph-bold ph-spinner animate-spin text-4xl mb-3 text-[#6B0D24] block mx-auto"></i>
            Loading Resort Schema Structure...
          </div>
        ) : schema.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-gray-400 text-xs font-bold">
            No categories added yet. Click "Add Category" above to begin building your resort schema.
          </div>
        ) : (
          schema.map((cat, cIdx) => (
            <div
              key={cat.id || cIdx}
              className="bg-white border-t-4 border-[#6B0D24] rounded-3xl shadow-xs overflow-hidden border border-gray-200"
            >
              {/* Category Header */}
              <div className="bg-gray-50 p-4 px-6 flex justify-between items-center border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-black text-gray-900">{cat.name}</h3>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 ml-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cat.isRepeatable || false}
                      onChange={(e) => handleUpdateProperty(cIdx, null, null, 'isRepeatable', e.target.checked)}
                      className="w-4 h-4 text-[#6B0D24] rounded border-gray-300"
                    />
                    <span>Allow Duplication (Repeatable)</span>
                  </label>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => handleMoveItem(cIdx, null, null, 'up')} className="p-1.5 hover:text-black">
                    <i className="ph ph-caret-up"></i>
                  </button>
                  <button onClick={() => handleMoveItem(cIdx, null, null, 'down')} className="p-1.5 hover:text-black">
                    <i className="ph ph-caret-down"></i>
                  </button>
                  <button onClick={() => handleRenameItem(cIdx)} className="p-1.5 text-blue-600 hover:text-blue-800">
                    <i className="ph ph-pencil-simple"></i>
                  </button>
                  <button onClick={() => handleDeleteItem(cIdx)} className="p-1.5 text-red-500 hover:text-red-700">
                    <i className="ph ph-trash"></i>
                  </button>
                </div>
              </div>

              {/* Subcategories & Fields Container */}
              <div className="p-6 space-y-4 bg-gray-50/50">
                {(cat.items || []).map((item: any, iIdx: number) => {
                  if (item.type === 'subcategory') {
                    return (
                      <div
                        key={item.id || iIdx}
                        className="ml-4 md:ml-6 border-l-4 border-green-500 bg-white shadow-2xs border border-gray-200 rounded-r-2xl mb-4 overflow-hidden"
                      >
                        <div className="bg-gray-50 p-3.5 px-5 flex justify-between items-center border-b border-gray-200">
                          <div className="flex items-center gap-3">
                            <h4 className="font-black text-gray-800 text-sm">{item.name}</h4>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 ml-4 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.isRepeatable || false}
                                onChange={(e) =>
                                  handleUpdateProperty(cIdx, iIdx, null, 'isRepeatable', e.target.checked)
                                }
                                className="w-4 h-4 text-[#6B0D24] rounded border-gray-300"
                              />
                              <span>Duplicate</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <button onClick={() => handleRenameItem(cIdx, iIdx)} className="p-1 text-blue-600">
                              <i className="ph ph-pencil-simple"></i>
                            </button>
                            <button onClick={() => handleDeleteItem(cIdx, iIdx)} className="p-1 text-red-500">
                              <i className="ph ph-trash"></i>
                            </button>
                          </div>
                        </div>

                        <div className="p-4 space-y-2 bg-gray-50/30">
                          {(item.items || []).map((field: any, fIdx: number) => (
                            <div
                              key={field.id || fIdx}
                              className="ml-2 sm:ml-4 flex items-center justify-between bg-white border border-gray-200 p-3 rounded-xl shadow-2xs gap-3 flex-wrap"
                            >
                              <div className="flex items-center gap-3 flex-1 flex-wrap">
                                <span className="font-bold text-xs text-gray-900 w-32 truncate" title={field.name}>
                                  {field.name}
                                </span>

                                <select
                                  value={field.fieldType || 'text'}
                                  onChange={(e) =>
                                    handleUpdateProperty(cIdx, iIdx, fIdx, 'fieldType', e.target.value)
                                  }
                                  className="text-xs border border-gray-300 rounded-lg p-1.5 bg-gray-50 font-bold"
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
                                    onChange={(e) =>
                                      handleUpdateProperty(cIdx, iIdx, fIdx, 'options', e.target.value)
                                    }
                                    placeholder="Options (comma separated)"
                                    className="text-xs border border-blue-400 bg-blue-50 text-blue-900 rounded-lg p-1.5 w-44 outline-none font-bold"
                                  />
                                )}

                                <select
                                  value={field.calcTag || 'none'}
                                  onChange={(e) =>
                                    handleUpdateProperty(cIdx, iIdx, fIdx, 'calcTag', e.target.value)
                                  }
                                  className={`text-xs border rounded-lg p-1.5 font-bold ${
                                    field.calcTag !== 'none' && field.calcTag
                                      ? 'border-purple-400 bg-purple-50 text-purple-700 font-bold'
                                      : 'border-gray-300 bg-gray-50'
                                  }`}
                                >
                                  {CALC_TAGS.map((ct) => (
                                    <option key={ct.val} value={ct.val}>
                                      {ct.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1 text-sm">
                                <button onClick={() => handleMoveItem(cIdx, iIdx, fIdx, 'up')} className="p-1 text-gray-400 hover:text-black">
                                  <i className="ph ph-caret-up"></i>
                                </button>
                                <button onClick={() => handleMoveItem(cIdx, iIdx, fIdx, 'down')} className="p-1 text-gray-400 hover:text-black">
                                  <i className="ph ph-caret-down"></i>
                                </button>
                                <button onClick={() => handleRenameItem(cIdx, iIdx, fIdx)} className="p-1 text-blue-600">
                                  <i className="ph ph-pencil-simple"></i>
                                </button>
                                <button onClick={() => handleDeleteItem(cIdx, iIdx, fIdx)} className="p-1 text-red-500">
                                  <i className="ph ph-trash"></i>
                                </button>
                              </div>
                            </div>
                          ))}

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleAddField(cIdx, iIdx)}
                              className="text-xs bg-white hover:bg-gray-100 text-gray-800 font-bold py-1.5 px-3 rounded-lg border border-gray-300 shadow-2xs transition"
                            >
                              + Add Field
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Direct Category Field
                  return (
                    <div
                      key={item.id || iIdx}
                      className="ml-2 sm:ml-4 flex items-center justify-between bg-white border border-gray-200 p-3 rounded-xl shadow-2xs gap-3 flex-wrap"
                    >
                      <div className="flex items-center gap-3 flex-1 flex-wrap">
                        <span className="font-bold text-xs text-gray-900 w-32 truncate" title={item.name}>
                          {item.name}
                        </span>

                        <select
                          value={item.fieldType || 'text'}
                          onChange={(e) => handleUpdateProperty(cIdx, null, iIdx, 'fieldType', e.target.value)}
                          className="text-xs border border-gray-300 rounded-lg p-1.5 bg-gray-50 font-bold"
                        >
                          {FIELD_TYPES.map((ft) => (
                            <option key={ft.val} value={ft.val}>
                              {ft.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={item.calcTag || 'none'}
                          onChange={(e) => handleUpdateProperty(cIdx, null, iIdx, 'calcTag', e.target.value)}
                          className={`text-xs border rounded-lg p-1.5 font-bold ${
                            item.calcTag !== 'none' && item.calcTag
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-gray-300 bg-gray-50'
                          }`}
                        >
                          {CALC_TAGS.map((ct) => (
                            <option key={ct.val} value={ct.val}>
                              {ct.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1 text-sm">
                        <button onClick={() => handleMoveItem(cIdx, null, iIdx, 'up')} className="p-1 text-gray-400 hover:text-black">
                          <i className="ph ph-caret-up"></i>
                        </button>
                        <button onClick={() => handleMoveItem(cIdx, null, iIdx, 'down')} className="p-1 text-gray-400 hover:text-black">
                          <i className="ph ph-caret-down"></i>
                        </button>
                        <button onClick={() => handleRenameItem(cIdx, null, iIdx)} className="p-1 text-blue-600">
                          <i className="ph ph-pencil-simple"></i>
                        </button>
                        <button onClick={() => handleDeleteItem(cIdx, null, iIdx)} className="p-1 text-red-500">
                          <i className="ph ph-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleAddSubCategory(cIdx)}
                    className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold py-2 px-3 rounded-xl border border-blue-200 transition"
                  >
                    + Add Sub-category
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddField(cIdx)}
                    className="text-xs bg-white hover:bg-gray-100 text-gray-800 font-bold py-2 px-3 rounded-xl border border-gray-300 transition"
                  >
                    + Add Field
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}