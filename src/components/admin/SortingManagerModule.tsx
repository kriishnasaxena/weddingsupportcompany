'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ResortRaw {
  id: string;
  _recordName?: string;
  name?: string;
  core_location?: string;
  location?: string;
  core_star_rating?: string;
  star_rating?: string;
  core_brand?: string;
  brand?: string;
  core_feature?: string;
  feature?: string;
  core_rooms?: string | number;
  rooms?: string | number;
  core_hidden?: boolean;
}

interface TileConfig {
  id: string;
  label: string;
  image: string;
  ruleType: 'location' | 'star' | 'rooms' | 'guests' | 'brand' | 'feature' | 'manual';
  ruleValue: string;
  manualAddedIds: string[];
  manualRemovedIds: string[];
  assignedResortIds: string[];
}

interface SortingSection {
  id: string;
  heading: string;
  sequence: number;
  description: string;
  shapeType: 'circular' | 'square' | 'horizontal' | 'vertical';
  tiles: TileConfig[];
  lastModified?: any;
}

const ROOM_RANGES = [
  '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100', '100-150', '150-200', '200+'
];

const GUEST_RANGES = [
  '0-25', '25-50', '50-75', '75-100', '100-125', '125-150', '150-175', '175-200', '200-225', '225-250', '250-275', '275-300', '300+'
];

function isValueInRange(val: number, rangeStr: string) {
  if (!rangeStr) return false;
  if (rangeStr.endsWith('+')) {
    const lower = parseInt(rangeStr.slice(0, -1));
    return val >= lower;
  }
  const parts = rangeStr.split('-');
  if (parts.length === 2) {
    const lower = parseInt(parts[0]);
    const upper = parseInt(parts[1]);
    return val >= lower && val <= upper;
  }
  return false;
}

export default function SortingManagerModule() {
  const [resortsRaw, setResortsRaw] = useState<ResortRaw[]>([]);
  const [sections, setSections] = useState<SortingSection[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalSectionId, setModalSectionId] = useState('');
  const [secHeading, setSecHeading] = useState('');
  const [secSequence, setSecSequence] = useState<number>(10);
  const [secDescription, setSecDescription] = useState('');
  const [secShapeType, setSecShapeType] = useState<'circular' | 'square' | 'horizontal' | 'vertical'>('circular');
  const [tilesStack, setTilesStack] = useState<TileConfig[]>([]);

  // Unique attribute options extracted from resort catalog
  const uniqueLocations = useMemo(() => {
    return Array.from(new Set(resortsRaw.map(r => (r.core_location || r.location || '').trim()))).filter(Boolean).sort();
  }, [resortsRaw]);

  const uniqueStarRatings = useMemo(() => {
    return Array.from(new Set(resortsRaw.map(r => String(r.core_star_rating || r.star_rating || '').trim()))).filter(Boolean).sort();
  }, [resortsRaw]);

  const uniqueBrands = useMemo(() => {
    return Array.from(new Set(resortsRaw.map(r => (r.core_brand || r.brand || '').trim()))).filter(Boolean).sort();
  }, [resortsRaw]);

  const uniqueFeatures = useMemo(() => {
    return Array.from(new Set(resortsRaw.map(r => (r.core_feature || r.feature || '').trim()))).filter(Boolean).sort();
  }, [resortsRaw]);

  // Load Firestore data
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load raw resorts
      const resortSnap = await getDocs(collection(db, 'resort_data'));
      const list: ResortRaw[] = [];
      resortSnap.forEach((d) => {
        const data = d.data();
        if (!data.core_hidden) {
          list.push({ id: d.id, ...data });
        }
      });
      setResortsRaw(list);

      // 2. Load homepage sortings
      const sortingsSnap = await getDocs(collection(db, 'homepage_sortings'));
      const secList: SortingSection[] = [];
      sortingsSnap.forEach((docSnap) => {
        secList.push({ id: docSnap.id, ...docSnap.data() } as SortingSection);
      });
      secList.sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
      setSections(secList);
    } catch (err) {
      console.error('Error fetching sorting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute matched resort IDs for a single tile
  const getMatchedResortIds = (tile: TileConfig) => {
    let matches: ResortRaw[] = [];
    if (tile.ruleType !== 'manual' && tile.ruleValue) {
      matches = resortsRaw.filter((res) => {
        if (tile.ruleType === 'location') {
          const loc = (res.core_location || res.location || '').trim();
          return loc.toLowerCase() === tile.ruleValue.toLowerCase();
        }
        if (tile.ruleType === 'star') {
          const starVal = String(res.core_star_rating || res.star_rating || '').replace(/[^0-9.]/g, '').trim();
          const targetVal = String(tile.ruleValue).replace(/[^0-9.]/g, '').trim();
          return starVal === targetVal;
        }
        if (tile.ruleType === 'rooms') {
          const rooms = parseInt(String(res.core_rooms || res.rooms || 0));
          return isValueInRange(rooms, tile.ruleValue);
        }
        if (tile.ruleType === 'guests') {
          const rooms = parseInt(String(res.core_rooms || res.rooms || 0));
          const capacity = rooms * 3;
          return isValueInRange(capacity, tile.ruleValue);
        }
        if (tile.ruleType === 'brand') {
          const brand = (res.core_brand || res.brand || '').trim();
          return brand.toLowerCase() === tile.ruleValue.toLowerCase();
        }
        if (tile.ruleType === 'feature') {
          const feature = (res.core_feature || res.feature || '').trim();
          return feature.toLowerCase() === tile.ruleValue.toLowerCase();
        }
        return false;
      });
    }

    let merged = matches.map((m) => m.id);
    (tile.manualAddedIds || []).forEach((id) => {
      if (!merged.includes(id)) merged.push(id);
    });
    return merged.filter((id) => !(tile.manualRemovedIds || []).includes(id));
  };

  // Create new Section modal setup
  const openNewSectionModal = () => {
    setModalSectionId('');
    setSecHeading('');
    setSecSequence((sections.length + 1) * 10);
    setSecDescription('');
    setSecShapeType('circular');
    setTilesStack([
      {
        id: 'tile_' + Math.random().toString(36).substring(2, 9),
        label: '',
        image: '',
        ruleType: 'location',
        ruleValue: '',
        manualAddedIds: [],
        manualRemovedIds: [],
        assignedResortIds: [],
      },
    ]);
    setModalOpen(true);
  };

  // Edit existing Section
  const handleEditSection = async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'homepage_sortings', id));
      if (!snap.exists()) {
        alert('Configuration target missing.');
        return;
      }
      const data = snap.data() as SortingSection;
      setModalSectionId(id);
      setSecHeading(data.heading || '');
      setSecSequence(data.sequence || 10);
      setSecDescription(data.description || '');
      setSecShapeType(data.shapeType || 'circular');
      setTilesStack(
        data.tiles && data.tiles.length > 0
          ? data.tiles
          : [
              {
                id: 'tile_' + Math.random().toString(36).substring(2, 9),
                label: '',
                image: '',
                ruleType: 'location',
                ruleValue: '',
                manualAddedIds: [],
                manualRemovedIds: [],
                assignedResortIds: [],
              },
            ]
      );
      setModalOpen(true);
    } catch (err) {
      console.error('Fetch document failed:', err);
    }
  };

  // Delete Section
  const handleDeleteSection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom sorting section?')) return;
    try {
      await deleteDoc(doc(db, 'homepage_sortings', id));
      await loadData();
    } catch (err) {
      console.error('Deletion failed:', err);
      alert('Failed to delete section.');
    }
  };

  // Tile helper operations inside form
  const addTileToStack = () => {
    setTilesStack([
      ...tilesStack,
      {
        id: 'tile_' + Math.random().toString(36).substring(2, 9),
        label: '',
        image: '',
        ruleType: 'location',
        ruleValue: '',
        manualAddedIds: [],
        manualRemovedIds: [],
        assignedResortIds: [],
      },
    ]);
  };

  const removeTileFromStack = (tIdx: number) => {
    setTilesStack(tilesStack.filter((_, idx) => idx !== tIdx));
  };

  const updateTileField = (tIdx: number, field: keyof TileConfig, value: any) => {
    const updated = [...tilesStack];
    (updated[tIdx] as any)[field] = value;
    if (field === 'ruleType') {
      updated[tIdx].ruleValue = '';
    }
    setTilesStack(updated);
  };

  const addManualInclude = (tIdx: number, resortId: string) => {
    if (!resortId) return;
    const updated = [...tilesStack];
    const tile = updated[tIdx];
    const added = [...(tile.manualAddedIds || [])];
    const removed = [...(tile.manualRemovedIds || [])];

    if (!added.includes(resortId)) added.push(resortId);
    const rmIdx = removed.indexOf(resortId);
    if (rmIdx > -1) removed.splice(rmIdx, 1);

    tile.manualAddedIds = added;
    tile.manualRemovedIds = removed;
    setTilesStack(updated);
  };

  const removeManualOverride = (tIdx: number, resortId: string) => {
    const updated = [...tilesStack];
    const tile = updated[tIdx];
    const added = [...(tile.manualAddedIds || [])];
    const removed = [...(tile.manualRemovedIds || [])];

    const addIdx = added.indexOf(resortId);
    if (addIdx > -1) {
      added.splice(addIdx, 1);
    } else {
      if (!removed.includes(resortId)) removed.push(resortId);
    }

    tile.manualAddedIds = added;
    tile.manualRemovedIds = removed;
    setTilesStack(updated);
  };

  // Save Sorting Section to Firestore
  const handleSaveSection = async () => {
    if (!secHeading.trim()) {
      alert('Please specify a Section Heading.');
      return;
    }

    for (let i = 0; i < tilesStack.length; i++) {
      if (!tilesStack[i].label.trim()) {
        alert(`Tile #${i + 1} must have a label.`);
        return;
      }
    }

    setSaving(true);
    const targetId = modalSectionId || 'sort_' + Math.random().toString(36).substring(2, 9);

    const resolvedTiles: TileConfig[] = tilesStack.map((tile) => {
      const assigned = getMatchedResortIds(tile);
      return {
        ...tile,
        assignedResortIds: assigned,
      };
    });

    const docPayload: SortingSection = {
      id: targetId,
      heading: secHeading.trim(),
      sequence: Number(secSequence) || 0,
      description: secDescription.trim(),
      shapeType: secShapeType,
      tiles: resolvedTiles,
      lastModified: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'homepage_sortings', targetId), docPayload);
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving sorting section:', err);
      alert('Failed to save grouping layout: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* TOP BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shrink-0">
            <i className="ph-bold ph-sliders text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">WedSaaS Sorting Manager</h2>
            <p className="text-xs text-gray-500 font-medium">Configure homepage curated groupings &amp; search tiles</p>
          </div>
        </div>

        <button
          onClick={openNewSectionModal}
          className="bg-black hover:bg-gray-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <i className="ph-bold ph-plus text-sm"></i>
          <span>Create Sorting Section</span>
        </button>
      </div>

      {/* DASHBOARD LIST AREA WITH INDIVIDUAL SCROLL */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 overflow-y-auto space-y-6 shadow-xs">
        <div>
          <h3 className="text-lg font-black text-gray-900">Active Homepage Sections ({sections.length})</h3>
          <p className="text-xs text-gray-500 mt-1">
            These configured groupings are live on your homepage. Adjust sequence weights and rule criteria.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
            <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-blue-600 block mx-auto"></i>
            Reading database groupings...
          </div>
        ) : sections.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-3">
            <i className="ph-bold ph-folder-open text-4xl text-gray-300 block mx-auto"></i>
            <p className="text-gray-500 text-xs font-bold">No sorting sections created yet</p>
            <button
              onClick={openNewSectionModal}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
            >
              + Create your first section
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sections.map((sec) => (
              <div
                key={sec.id}
                className="border border-gray-200 rounded-2xl p-5 bg-white hover:shadow-md transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                      Seq: {sec.sequence}
                    </span>
                    <span className="bg-gray-100 text-gray-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                      {sec.shapeType} shape
                    </span>
                    <span className="text-xs text-gray-400 font-bold">
                      {sec.tiles?.length || 0} tile(s)
                    </span>
                  </div>
                  <h4 className="text-base font-black text-gray-900 truncate">{sec.heading}</h4>
                  {sec.description && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-1">{sec.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    onClick={() => handleEditSection(sec.id)}
                    className="px-3.5 py-1.5 border border-gray-200 hover:border-black text-xs font-bold text-gray-700 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    ✏️ Edit Config
                  </button>
                  <button
                    onClick={() => handleDeleteSection(sec.id)}
                    className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION BUILDER MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl relative my-8 flex flex-col max-h-[90vh]">
            <header className="p-6 border-b border-gray-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {modalSectionId ? 'Edit Sorting Section' : 'Create Sorting Section'}
                </h3>
                <p className="text-xs text-gray-500">Configure visual shapes, sorting targets, and filter rules</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-lg p-1"
              >
                ✖
              </button>
            </header>

            {/* SCROLLABLE FORM BODY */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* METADATA FIELDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    Section Heading *
                  </label>
                  <input
                    type="text"
                    value={secHeading}
                    onChange={(e) => setSecHeading(e.target.value)}
                    placeholder="e.g., Destination Dream Weddings"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-black outline-none font-bold text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    Sequence Weight (Order) *
                  </label>
                  <input
                    type="number"
                    value={secSequence}
                    onChange={(e) => setSecSequence(Number(e.target.value))}
                    placeholder="10"
                    min="1"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-black outline-none font-bold text-xs"
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    Optional Description
                  </label>
                  <textarea
                    value={secDescription}
                    onChange={(e) => setSecDescription(e.target.value)}
                    placeholder="Provide context about this specific set of tiles..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-black outline-none font-medium text-xs h-16"
                  />
                </div>
              </div>

              {/* SHAPE SELECTOR */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">
                  Shape &amp; Tile Display Format
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Circular */}
                  <label
                    onClick={() => setSecShapeType('circular')}
                    className={`cursor-pointer border p-4 rounded-2xl flex flex-col items-center text-center transition ${
                      secShapeType === 'circular'
                        ? 'border-black bg-blue-50/30'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-200 mb-2 border border-gray-300"></div>
                    <span className="text-xs font-bold text-gray-900 block">Circular</span>
                    <span className="text-[9px] text-gray-400 font-medium">Text below image</span>
                  </label>

                  {/* Square */}
                  <label
                    onClick={() => setSecShapeType('square')}
                    className={`cursor-pointer border p-4 rounded-2xl flex flex-col items-center text-center transition ${
                      secShapeType === 'square'
                        ? 'border-black bg-blue-50/30'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-200 mb-2 border border-gray-300"></div>
                    <span className="text-xs font-bold text-gray-900 block">Square Tile</span>
                    <span className="text-[9px] text-gray-400 font-medium">Rounded Corners</span>
                  </label>

                  {/* Horizontal */}
                  <label
                    onClick={() => setSecShapeType('horizontal')}
                    className={`cursor-pointer border p-4 rounded-2xl flex flex-col items-center text-center transition ${
                      secShapeType === 'horizontal'
                        ? 'border-black bg-blue-50/30'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-16 h-10 rounded-xl bg-gray-200 mb-2 border border-gray-300"></div>
                    <span className="text-xs font-bold text-gray-900 block">Horizontal Rect</span>
                    <span className="text-[9px] text-gray-400 font-medium">Banner style ratios</span>
                  </label>

                  {/* Vertical */}
                  <label
                    onClick={() => setSecShapeType('vertical')}
                    className={`cursor-pointer border p-4 rounded-2xl flex flex-col items-center text-center transition ${
                      secShapeType === 'vertical'
                        ? 'border-black bg-blue-50/30'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-14 rounded-xl bg-gray-200 mb-2 border border-gray-300"></div>
                    <span className="text-xs font-bold text-gray-900 block">Vertical Rect</span>
                    <span className="text-[9px] text-gray-400 font-medium">Portrait style ratios</span>
                  </label>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* DYNAMIC TILE CONFIGURATION STACK */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider">
                    Configure Sort Targets (Tiles)
                  </h4>
                  <button
                    type="button"
                    onClick={addTileToStack}
                    className="bg-gray-100 hover:bg-black hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    + Add New Tile
                  </button>
                </div>

                <div className="space-y-4">
                  {tilesStack.map((tile, tIdx) => {
                    const matchedIds = getMatchedResortIds(tile);
                    const manualAdd = tile.manualAddedIds || [];
                    const manualRemove = tile.manualRemovedIds || [];

                    return (
                      <div
                        key={tile.id || tIdx}
                        className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 relative flex flex-col gap-4 space-y-2"
                      >
                        <button
                          type="button"
                          onClick={() => removeTileFromStack(tIdx)}
                          className="absolute top-4 right-4 text-gray-400 hover:text-red-500 font-bold p-1 text-xs"
                          title="Delete Tile"
                        >
                          🗑️ Delete
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">
                              Tile Label *
                            </label>
                            <input
                              type="text"
                              value={tile.label}
                              onChange={(e) => updateTileField(tIdx, 'label', e.target.value)}
                              placeholder="e.g., Luxury Palaces"
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-black"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">
                              Tile Image URL
                            </label>
                            <input
                              type="text"
                              value={tile.image}
                              onChange={(e) => updateTileField(tIdx, 'image', e.target.value)}
                              placeholder="https://..."
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-black"
                            />
                          </div>
                        </div>

                        {/* QUERY RULES & SELECTION */}
                        <div className="border-t border-dashed border-gray-200 pt-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Assignment Rule Basis
                              </label>
                              <select
                                value={tile.ruleType}
                                onChange={(e) => updateTileField(tIdx, 'ruleType', e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
                              >
                                <option value="location">By Location</option>
                                <option value="star">By Star Rating</option>
                                <option value="rooms">By Rooms Range</option>
                                <option value="guests">By Guest Capacity Range</option>
                                <option value="brand">By Brand</option>
                                <option value="feature">By Feature</option>
                                <option value="manual">Manual Assignment Only</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">
                                Rule Value Match
                              </label>
                              <select
                                value={tile.ruleValue}
                                onChange={(e) => updateTileField(tIdx, 'ruleValue', e.target.value)}
                                disabled={tile.ruleType === 'manual'}
                                className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none ${
                                  tile.ruleType === 'manual' ? 'opacity-40 bg-gray-100' : ''
                                }`}
                              >
                                <option value="">-- Choose Criteria Value --</option>

                                {tile.ruleType === 'location' &&
                                  uniqueLocations.map((loc) => (
                                    <option key={loc} value={loc}>
                                      {loc}
                                    </option>
                                  ))}

                                {tile.ruleType === 'star' &&
                                  uniqueStarRatings.map((s) => (
                                    <option key={s} value={s}>
                                      {s} Star
                                    </option>
                                  ))}

                                {tile.ruleType === 'rooms' &&
                                  ROOM_RANGES.map((r) => (
                                    <option key={r} value={r}>
                                      {r} Rooms
                                    </option>
                                  ))}

                                {tile.ruleType === 'guests' &&
                                  GUEST_RANGES.map((g) => (
                                    <option key={g} value={g}>
                                      {g} Guests
                                    </option>
                                  ))}

                                {tile.ruleType === 'brand' &&
                                  uniqueBrands.map((b) => (
                                    <option key={b} value={b}>
                                      {b}
                                    </option>
                                  ))}

                                {tile.ruleType === 'feature' &&
                                  uniqueFeatures.map((f) => (
                                    <option key={f} value={f}>
                                      {f}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* LIVE MATCHES & OVERRIDES DASHBOARD */}
                        <div className="bg-white/80 border border-gray-200 rounded-xl p-3 space-y-2">
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                            Live Rule Matches ({matchedIds.length} Resorts)
                          </p>

                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 border border-gray-100 rounded-md bg-gray-50/50">
                            {matchedIds.length === 0 ? (
                              <span className="text-[10px] text-gray-400 italic">
                                0 matching resorts. Choose/adjust rule sets or force include below.
                              </span>
                            ) : (
                              matchedIds.map((id) => {
                                const res = resortsRaw.find((r) => r.id === id);
                                const isForced = manualAdd.includes(id);
                                const resName = res ? res._recordName || res.name : 'Unknown';

                                return (
                                  <span
                                    key={id}
                                    className={`text-[9px] px-2 py-0.5 border rounded-md inline-flex items-center gap-1 ${
                                      isForced
                                        ? 'bg-green-50 text-green-700 border-green-200 font-bold'
                                        : 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                                    }`}
                                  >
                                    <span>{resName}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeManualOverride(tIdx, id)}
                                      className="hover:text-red-500 font-bold ml-1"
                                      title="Exclude"
                                    >
                                      ✖
                                    </button>
                                  </span>
                                );
                              })
                            )}
                          </div>

                          {/* MANUAL FORCE INCLUDE */}
                          <div className="flex items-center gap-2 pt-1">
                            <select
                              id={`manualSelect_${tIdx}`}
                              className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none"
                              defaultValue=""
                            >
                              <option value="">-- Override: Force Include Resort --</option>
                              {resortsRaw.map((res) => (
                                <option key={res.id} value={res.id}>
                                  {res._recordName || res.name || 'Unnamed'}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  `manualSelect_${tIdx}`
                                ) as HTMLSelectElement;
                                if (el && el.value) {
                                  addManualInclude(tIdx, el.value);
                                  el.value = '';
                                }
                              }}
                              className="px-3 py-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Force Include
                            </button>
                          </div>

                          {/* OVERRIDES TAGS */}
                          {(manualAdd.length > 0 || manualRemove.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {manualAdd.map((id) => {
                                const res = resortsRaw.find((r) => r.id === id);
                                return (
                                  <span
                                    key={`add_${id}`}
                                    className="bg-green-100 text-green-800 border border-green-200 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                                  >
                                    + {res?._recordName || res?.name || id}
                                    <button
                                      type="button"
                                      onClick={() => removeManualOverride(tIdx, id)}
                                      className="text-red-500 font-bold ml-1"
                                    >
                                      ✖
                                    </button>
                                  </span>
                                );
                              })}
                              {manualRemove.map((id) => {
                                const res = resortsRaw.find((r) => r.id === id);
                                return (
                                  <span
                                    key={`rem_${id}`}
                                    className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                                  >
                                    - {res?._recordName || res?.name || id}
                                    <button
                                      type="button"
                                      onClick={() => removeManualOverride(tIdx, id)}
                                      className="text-red-500 font-bold ml-1"
                                    >
                                      ✖
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <footer className="p-6 border-t border-gray-200 flex justify-end gap-3 shrink-0 bg-gray-50 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:text-black font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSection}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : '💾 Save Grouping Layout'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}