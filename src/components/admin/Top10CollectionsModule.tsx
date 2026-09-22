'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ResortOption {
  id: string;
  name: string;
  location: string;
  rooms: number;
  image: string;
}

interface RankedResort {
  rank: number;
  resortId: string;
  resortName: string;
  resortRooms: number;
  resortImage: string;
}

interface Top10Collection {
  id: string;
  heading: string;
  sequence: number;
  isActive: boolean;
  resorts: RankedResort[];
  updatedAt?: string;
}

function extractCoverImage(data: any): string {
  for (const key in data) {
    if (typeof data[key] === 'string' && data[key].includes('firebasestorage.googleapis.com')) {
      return data[key].split(', ')[0];
    }
  }
  return 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=400';
}

export default function Top10CollectionsModule() {
  const [allResorts, setAllResorts] = useState<ResortOption[]>([]);
  const [collections, setCollections] = useState<Top10Collection[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDocId, setEditDocId] = useState('');
  const [listHeading, setListHeading] = useState('');
  const [listSequence, setListSequence] = useState<number>(10);
  const [listActive, setListActive] = useState(true);

  // Current assigned ranks (index 0 = Rank #1, index 9 = Rank #10)
  const [assignedRanks, setAssignedRanks] = useState<(RankedResort | null)[]>(
    new Array(10).fill(null)
  );

  // Load datasets
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch raw resort catalog
      const resortSnap = await getDocs(collection(db, 'resort_data'));
      const rList: ResortOption[] = [];
      resortSnap.forEach((d) => {
        const data = d.data();
        if (!data.core_hidden) {
          rList.push({
            id: d.id,
            name: data._recordName || data.name || 'Unnamed Resort',
            location: data.core_location || data.location || 'India',
            rooms: parseInt(data.core_rooms || data.rooms || 0),
            image: extractCoverImage(data),
          });
        }
      });
      rList.sort((a, b) => a.name.localeCompare(b.name));
      setAllResorts(rList);

      // 2. Fetch Top 10 collections
      const topSnap = await getDocs(collection(db, 'homepage_top10'));
      const cList: Top10Collection[] = [];
      topSnap.forEach((d) => {
        cList.push({ id: d.id, ...d.data() } as Top10Collection);
      });
      cList.sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
      setCollections(cList);
    } catch (err) {
      console.error('Error fetching Top 10 data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Create Modal
  const openNewModal = () => {
    setEditDocId('');
    setListHeading('');
    setListSequence((collections.length + 1) * 10);
    setListActive(true);
    setAssignedRanks(new Array(10).fill(null));
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleEditCollection = async (docId: string) => {
    try {
      const col = collections.find((c) => c.id === docId);
      if (!col) return;

      setEditDocId(docId);
      setListHeading(col.heading || '');
      setListSequence(col.sequence || 10);
      setListActive(col.isActive !== false);

      const slots = new Array(10).fill(null);
      if (col.resorts && Array.isArray(col.resorts)) {
        col.resorts.forEach((item) => {
          if (item && item.rank >= 1 && item.rank <= 10) {
            slots[item.rank - 1] = item;
          }
        });
      }
      setAssignedRanks(slots);
      setModalOpen(true);
    } catch (err) {
      console.error('Error opening edit modal:', err);
    }
  };

  // Delete Collection
  const handleDeleteCollection = async (docId: string) => {
    if (!confirm('Are you sure you want to permanently delete this Top 10 collection?')) return;
    try {
      await deleteDoc(doc(db, 'homepage_top10', docId));
      await loadData();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Could not delete collection.');
    }
  };

  // Assign resort to rank slot (0-indexed)
  const assignResortToRank = (rankIdx: number, resortId: string) => {
    const updated = [...assignedRanks];
    if (!resortId) {
      updated[rankIdx] = null;
    } else {
      const found = allResorts.find((r) => r.id === resortId);
      if (found) {
        updated[rankIdx] = {
          rank: rankIdx + 1,
          resortId: found.id,
          resortName: found.name,
          resortRooms: found.rooms,
          resortImage: found.image,
        };
      }
    }
    setAssignedRanks(updated);
  };

  // Clear single slot
  const clearRankSlot = (rankIdx: number) => {
    const updated = [...assignedRanks];
    updated[rankIdx] = null;
    setAssignedRanks(updated);
  };

  // Save Collection
  const handleSaveTop10 = async () => {
    if (!listHeading.trim()) {
      alert("Please enter a Collection Heading (e.g., 'Top 10 in Goa').");
      return;
    }

    const activeResorts = assignedRanks.filter((item): item is RankedResort => item !== null && !!item.resortId);

    if (activeResorts.length === 0) {
      if (!confirm('You have not assigned any resorts to this list. Save as empty collection?')) return;
    }

    setSaving(true);
    const docId = editDocId || 'top10_' + Date.now();

    const payload: Top10Collection = {
      id: docId,
      heading: listHeading.trim(),
      sequence: Number(listSequence) || 10,
      isActive: listActive,
      resorts: activeResorts,
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'homepage_top10', docId), payload);
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Error saving Top 10 collection:', err);
      alert('Failed to save to database: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* TOP HEADER BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-trophy text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">Top 10 Resorts Manager</h2>
            <p className="text-xs text-gray-500 font-medium">
              Configure Netflix-style ranked countdown collections for homepage
            </p>
          </div>
        </div>

        <button
          onClick={openNewModal}
          className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <i className="ph-bold ph-plus text-sm"></i>
          <span>Create New Top 10 List</span>
        </button>
      </div>

      {/* DASHBOARD LIST CONTAINER WITH INTERNAL SCROLL */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 overflow-y-auto space-y-6 shadow-xs">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black text-gray-900">
              Active Top 10 Collections ({collections.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage ranked countdown collections displayed on web and mobile.
            </p>
          </div>

          <button
            onClick={loadData}
            className="text-gray-400 hover:text-black font-bold p-1 text-sm cursor-pointer"
            title="Refresh"
          >
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
            <i className="ph-bold ph-spinner animate-spin text-3xl mb-2 text-red-600 block mx-auto"></i>
            Reading Top 10 collections from Firestore...
          </div>
        ) : collections.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-3">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
              🏆
            </div>
            <p className="text-gray-900 font-black text-sm">No Top 10 lists created yet</p>
            <p className="text-gray-500 text-xs max-w-sm mx-auto">
              Create ranked lists like &quot;Top 10 in Goa&quot; or &quot;Top 10 Value Palaces&quot;.
            </p>
            <button
              onClick={openNewModal}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              + Create First Top 10 List
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {collections.map((col) => {
              const activeResorts = col.resorts ? col.resorts.filter((r) => r && r.resortId) : [];
              const topThree = activeResorts.slice(0, 3);

              return (
                <div
                  key={col.id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-black transition flex flex-col justify-between relative"
                >
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                          Seq: {col.sequence || 10}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            col.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {col.isActive ? 'Active' : 'Hidden'}
                        </span>
                        <span className="text-xs font-bold text-gray-400 ml-1">
                          {activeResorts.length}/10 Ranks Filled
                        </span>
                      </div>
                      <h4 className="text-base font-black text-gray-900 leading-tight">{col.heading}</h4>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleEditCollection(col.id)}
                        className="p-2 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 hover:bg-black hover:text-white transition font-bold text-xs cursor-pointer"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteCollection(col.id)}
                        className="p-2 rounded-lg bg-red-50 border border-red-100 text-red-600 hover:bg-red-600 hover:text-white transition font-bold text-xs cursor-pointer"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center">
                      {topThree.length > 0 ? (
                        topThree.map((r, rIdx) => (
                          <div
                            key={r.resortId || rIdx}
                            className="w-9 h-9 rounded-lg overflow-hidden border border-white shadow-xs shrink-0 bg-gray-100 -ml-2 first:ml-0"
                            title={`#${r.rank}: ${r.resortName}`}
                          >
                            <img src={r.resortImage} alt={r.resortName} className="w-full h-full object-cover" />
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">No resorts assigned yet</span>
                      )}
                      {activeResorts.length > 3 && (
                        <span className="text-[10px] font-bold text-gray-500 ml-2">
                          +{activeResorts.length - 3} more
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleEditCollection(col.id)}
                      className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Manage Ranks &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200000] bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <header className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {editDocId ? 'Edit Top 10 Collection' : 'Create Top 10 Collection'}
                </h3>
                <p className="text-xs text-gray-500">
                  Assign exact ranks from #1 to #10 by choosing from your resort catalog.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-200/60 hover:bg-black hover:text-white flex items-center justify-center text-gray-600 transition font-bold"
              >
                ✖
              </button>
            </header>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Metadata Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    Collection Heading *
                  </label>
                  <input
                    type="text"
                    value={listHeading}
                    onChange={(e) => setListHeading(e.target.value)}
                    placeholder="e.g., Top 10 Resorts in Jim Corbett"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:border-black outline-none font-black text-sm text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    Sequence Order *
                  </label>
                  <input
                    type="number"
                    value={listSequence}
                    onChange={(e) => setListSequence(Number(e.target.value))}
                    placeholder="10"
                    min="1"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:border-black outline-none font-bold text-sm text-gray-900"
                    required
                  />
                </div>
                <div className="md:col-span-3 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="listActive"
                    checked={listActive}
                    onChange={(e) => setListActive(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded border-gray-300"
                  />
                  <label htmlFor="listActive" className="text-xs font-bold text-gray-700 cursor-pointer">
                    Active (Display this countdown collection on homepage)
                  </label>
                </div>
              </div>

              <hr className="border-gray-200" />

              {/* 10 RANK SLOTS BUILDER */}
              <div className="space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-1.5">
                    🏆 Assign Resorts to Ranks (#1 to #10)
                  </h4>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">
                    Select from catalog dropdown
                  </span>
                </div>

                {assignedRanks.map((assigned, i) => {
                  const rankNum = i + 1;

                  return (
                    <div
                      key={i}
                      className={`flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border transition ${
                        assigned ? 'bg-red-50/30 border-red-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      {/* Rank Badge */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="w-8 h-8 rounded-lg bg-black text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                          #{rankNum}
                        </span>
                        <span className="text-xs font-bold text-gray-500 md:hidden uppercase">
                          Rank #{rankNum} Slot
                        </span>
                      </div>

                      {/* Resort Selector Dropdown */}
                      <div className="flex-1 min-w-0">
                        <select
                          value={assigned?.resortId || ''}
                          onChange={(e) => assignResortToRank(i, e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-900 focus:border-black focus:outline-none"
                        >
                          <option value="">-- Leave Rank #{rankNum} Empty --</option>
                          {allResorts.map((res) => (
                            <option key={res.id} value={res.id}>
                              {res.name} ({res.location} | {res.rooms} Rooms)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Live Slot Card Preview */}
                      <div className="w-full md:w-64 shrink-0">
                        {assigned ? (
                          <div className="flex items-center justify-between gap-2.5 bg-white border border-gray-200 p-2 rounded-lg shadow-2xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={assigned.resortImage}
                                alt={assigned.resortName}
                                className="w-8 h-8 rounded object-cover shrink-0 bg-gray-100"
                              />
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-gray-900 truncate leading-none mb-1">
                                  {assigned.resortName}
                                </h5>
                                <span className="text-[9px] font-bold text-gray-500 block leading-none">
                                  🚪 {assigned.resortRooms} Rooms
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => clearRankSlot(i)}
                              className="text-gray-400 hover:text-red-600 p-1 font-bold text-xs"
                              title="Clear Slot"
                            >
                              ✖
                            </button>
                          </div>
                        ) : (
                          <div className="h-10 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-[11px] text-gray-400 italic bg-white/50">
                            Slot #{rankNum} unassigned
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <footer className="p-5 border-t border-gray-200 flex justify-end gap-3 shrink-0 bg-gray-50">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 hover:text-black font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTop10}
                disabled={saving}
                className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl transition flex items-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : '💾 Save Top 10 List'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}