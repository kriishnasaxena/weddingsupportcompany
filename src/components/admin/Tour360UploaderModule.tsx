'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface ResortOption {
  id: string;
  name: string;
}

interface Hotspot {
  targetId: string;
  x: number;
  y: number;
  z: number;
}

interface Scene {
  id: string;
  name: string;
  url: string;
  hotspots?: Hotspot[];
}

export default function Tour360UploaderModule() {
  const [resorts, setResorts] = useState<ResortOption[]>([]);
  const [loadingResorts, setLoadingResorts] = useState(true);
  const [selectedResortId, setSelectedResortId] = useState('');
  const [currentResortData, setCurrentResortData] = useState<any | null>(null);

  // Creation States
  const [newResortName, setNewResortName] = useState('');
  const [creatingResort, setCreatingResort] = useState(false);

  // Scene Upload States
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneFile, setNewSceneFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Visual Editor Modal State
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [targetSceneId, setTargetSceneId] = useState<string>('');
  const [loadingPano, setLoadingPano] = useState(false);

  // 360 Viewer Refs
  const editorCanvasContainerRef = useRef<HTMLDivElement>(null);
  const editorViewerRef = useRef<any>(null);
  const activePanoRef = useRef<any>(null);

  // Polyfill process object for Panolens / Three.js
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).process) {
      (window as any).process = { env: { NODE_ENV: 'production' } };
    }
  }, []);

  // 1. Fetch Resorts on Mount
  const fetchResorts = async () => {
    setLoadingResorts(true);
    try {
      const snap = await getDocs(collection(db, 'resort_data'));
      const list: ResortOption[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data._recordName || data.core_name || d.id,
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setResorts(list);
    } catch (e) {
      console.error('Error fetching resorts:', e);
    } finally {
      setLoadingResorts(false);
    }
  };

  useEffect(() => {
    fetchResorts();
  }, []);

  // 2. Load Resort 360 Data when resort selection changes
  const loadResortData = async (resortId: string) => {
    setSelectedResortId(resortId);
    if (!resortId) {
      setCurrentResortData(null);
      return;
    }

    try {
      const snap = await getDoc(doc(db, 'resort_data', resortId));
      if (snap.exists()) {
        setCurrentResortData(snap.data());
      } else {
        setCurrentResortData(null);
      }
    } catch (e) {
      console.error('Error loading resort data:', e);
    }
  };

  // 3. Create New Resort
  const handleCreateResort = async () => {
    if (!newResortName.trim()) return alert('Please enter a resort name');
    setCreatingResort(true);

    const id = 'REC_' + Date.now();
    try {
      await setDoc(doc(db, 'resort_data', id), {
        _recordName: newResortName.trim(),
        tour_360_scenes: [],
        updatedAt: new Date().toISOString(),
      });

      setNewResortName('');
      alert('Resort successfully created!');
      await fetchResorts();
      await loadResortData(id);
    } catch (error: any) {
      alert('Error creating resort: ' + error.message);
    } finally {
      setCreatingResort(false);
    }
  };

  // 4. Delete Entire Resort
  const handleDeleteResort = async () => {
    if (!selectedResortId || !currentResortData)
      return alert('Select a resort from the dropdown first!');

    if (
      !confirm(
        '⚠️ WARNING: This will permanently delete the ENTIRE resort and all 360° images from your database. Continue?'
      )
    )
      return;

    try {
      const scenes: Scene[] = currentResortData.tour_360_scenes || [];
      for (const scene of scenes) {
        try {
          await deleteObject(ref(storage, scene.url));
        } catch (e) {}
      }

      await deleteDoc(doc(db, 'resort_data', selectedResortId));

      alert('Resort completely deleted.');
      setSelectedResortId('');
      setCurrentResortData(null);
      await fetchResorts();
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  // 5. Upload New 360 Scene
  const handleUploadScene = async () => {
    if (!newSceneFile || !newSceneName.trim()) {
      return alert('Please provide a room name and select an image file.');
    }

    setUploading(true);

    const sceneId = 'scene_' + Date.now();
    const storageRef = ref(storage, `tours/${selectedResortId}/${sceneId}.jpg`);

    try {
      await uploadBytesResumable(storageRef, newSceneFile);
      const url = await getDownloadURL(storageRef);

      const newScene: Scene = { id: sceneId, name: newSceneName.trim(), url, hotspots: [] };
      const currentScenes: Scene[] = currentResortData?.tour_360_scenes || [];
      const updatedScenes = [...currentScenes, newScene];

      await setDoc(
        doc(db, 'resort_data', selectedResortId),
        { tour_360_scenes: updatedScenes },
        { merge: true }
      );

      setNewSceneName('');
      setNewSceneFile(null);
      await loadResortData(selectedResortId);
    } catch (error: any) {
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // 6. Delete Scene
  const handleDeleteScene = async (sceneId: string, sceneUrl: string) => {
    if (!confirm('Are you sure you want to delete this room? Any links pointing to it will break.'))
      return;

    try {
      try {
        await deleteObject(ref(storage, sceneUrl));
      } catch (e) {}

      const currentScenes: Scene[] = currentResortData?.tour_360_scenes || [];
      const updatedScenes = currentScenes.filter((s) => s.id !== sceneId);

      await setDoc(
        doc(db, 'resort_data', selectedResortId),
        { tour_360_scenes: updatedScenes },
        { merge: true }
      );

      await loadResortData(selectedResortId);
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  // --- 360 VISUAL EDITOR ENGINE ---
  const loadScript = (src: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  };

  const handleOpenVisualEditor = async (sceneId: string) => {
    const scenes: Scene[] = currentResortData?.tour_360_scenes || [];
    const sceneData = scenes.find((s) => s.id === sceneId);
    if (!sceneData || !sceneData.url) return;

    setActiveSceneId(sceneId);
    setTargetSceneId('');
    setEditorModalOpen(true);
    setLoadingPano(true);

    // Polyfill process object
    if (typeof window !== 'undefined' && !(window as any).process) {
      (window as any).process = { env: { NODE_ENV: 'production' } };
    }

    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/105/three.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/panolens@0.12.1/build/panolens.min.js');

      setTimeout(() => {
        initPanolensViewer(sceneData);
      }, 300);
    } catch (e) {
      console.error('Error loading 360 scripts:', e);
      setLoadingPano(false);
    }
  };

  const initPanolensViewer = (sceneData: Scene) => {
    const container = editorCanvasContainerRef.current;
    if (!container || typeof window === 'undefined' || !sceneData?.url) return;

    const THREE = (window as any).THREE;
    const PANOLENS = (window as any).PANOLENS;

    if (!PANOLENS || !THREE) return;

    // Enable CORS for Three.js texture loading
    if (THREE.ImageUtils) {
      THREE.ImageUtils.crossOrigin = 'anonymous';
    }

    // Pre-decoding image before feeding to WebGL texture loader (Fixes texImage2D error)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!editorViewerRef.current) {
        const viewer = new PANOLENS.Viewer({
          container: container,
          controlBar: true,
          cameraFov: 75,
        });

        viewer.container.addEventListener('dblclick', () => {
          const targetSelect = document.getElementById('hotspotTargetSelect') as HTMLSelectElement;
          const targetId = targetSelect?.value;

          if (!targetId) {
            alert('Please select a Target Destination Room from the dropdown top right first!');
            return;
          }

          const vector = new THREE.Vector3(0, 0, -1);
          vector.applyQuaternion(viewer.camera.quaternion);
          vector.multiplyScalar(4000);

          addHotspotToDatabase(targetId, vector.x, vector.y, vector.z);
        });

        editorViewerRef.current = viewer;
      }

      const viewer = editorViewerRef.current;

      if (activePanoRef.current) {
        try {
          viewer.remove(activePanoRef.current);
          activePanoRef.current.dispose();
        } catch (e) {}
      }

      const panorama = new PANOLENS.ImagePanorama(sceneData.url);

      if (sceneData.hotspots) {
        sceneData.hotspots.forEach((hs) => {
          const spot = new PANOLENS.Infospot(800, PANOLENS.DataImage.Arrow);
          spot.position.set(hs.x, hs.y, hs.z);
          panorama.add(spot);
        });
      }

      activePanoRef.current = panorama;
      viewer.add(panorama);
      viewer.setPanorama(panorama);
      setLoadingPano(false);
      setTimeout(() => viewer.onWindowResize(), 150);
    };

    img.onerror = () => {
      alert('Failed to load panoramic image texture. Please check image URL.');
      setLoadingPano(false);
    };

    img.src = sceneData.url;
  };

  const addHotspotToDatabase = async (targetId: string, x: number, y: number, z: number) => {
    if (!activeSceneId || !selectedResortId || !currentResortData) return;

    try {
      const scenes: Scene[] = [...(currentResortData.tour_360_scenes || [])];
      const sceneIndex = scenes.findIndex((s) => s.id === activeSceneId);

      if (sceneIndex === -1) return;

      if (!scenes[sceneIndex].hotspots) {
        scenes[sceneIndex].hotspots = [];
      }

      scenes[sceneIndex].hotspots!.push({ targetId, x, y, z });

      await setDoc(
        doc(db, 'resort_data', selectedResortId),
        { tour_360_scenes: scenes },
        { merge: true }
      );

      const PANOLENS = (window as any).PANOLENS;
      if (PANOLENS && activePanoRef.current) {
        const spot = new PANOLENS.Infospot(800, PANOLENS.DataImage.Arrow);
        spot.position.set(x, y, z);
        activePanoRef.current.add(spot);
      }

      alert('Navigation link saved! Double-click somewhere else to place another door.');
      await loadResortData(selectedResortId);
    } catch (e: any) {
      alert('Error saving hotspot link: ' + e.message);
    }
  };

  const handleCloseVisualEditor = async () => {
    setEditorModalOpen(false);
    if (selectedResortId) await loadResortData(selectedResortId);
  };

  const scenesList: Scene[] = currentResortData?.tour_360_scenes || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs flex justify-between items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 flex items-center gap-2">
            <i className="ph-bold ph-camera-rotate text-[#6B0D24]"></i> 360° Tour Manager
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Upload high-res panoramic room photos and place 3D navigation links between scenes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: RESORT SELECTOR & CREATOR */}
        <div className="space-y-6">
          {/* SELECT RESORT */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#6B0D24]">
              Select Resort
            </h3>

            {loadingResorts ? (
              <div className="text-xs text-gray-400 font-bold">Loading Resorts...</div>
            ) : (
              <select
                value={selectedResortId}
                onChange={(e) => loadResortData(e.target.value)}
                className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-200 text-xs font-bold text-gray-900 outline-none focus:border-[#6B0D24]"
              >
                <option value="">-- Choose a Resort --</option>
                {resorts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            {selectedResortId && (
              <button
                type="button"
                onClick={handleDeleteResort}
                className="w-full bg-red-50 border border-red-200 text-red-600 font-bold py-2.5 rounded-2xl text-xs hover:bg-red-600 hover:text-white transition cursor-pointer"
              >
                DELETE ENTIRE RESORT
              </button>
            )}
          </div>

          {/* CREATE NEW RESORT */}
          <div className="bg-stone-50 p-6 rounded-3xl border border-stone-200/80 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#6B0D24]">
              Create New Resort
            </h3>

            <input
              type="text"
              value={newResortName}
              onChange={(e) => setNewResortName(e.target.value)}
              placeholder="e.g. Anantum Gateway Resort"
              className="w-full p-3 rounded-2xl bg-white border border-gray-200 text-xs font-bold outline-none focus:border-[#6B0D24]"
            />

            <button
              type="button"
              onClick={handleCreateResort}
              disabled={creatingResort}
              className="w-full bg-[#6B0D24] text-white font-black py-3 rounded-2xl text-xs uppercase tracking-wider hover:bg-[#520a1a] transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {creatingResort ? 'Creating...' : '+ Create Resort'}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: 360 ROOM SCENES MANAGER */}
        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-xs space-y-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">
            Manage 360° Panoramic Rooms
          </h3>

          {!selectedResortId ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-xs font-bold">
              Select a resort from the left sidebar to manage its 360° virtual tour.
            </div>
          ) : (
            <div className="space-y-6">
              {/* UPLOAD SCENE FORM */}
              <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/80 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newSceneName}
                    onChange={(e) => setNewSceneName(e.target.value)}
                    placeholder="e.g. Grand Lawn, Lobby, Deluxe Suite..."
                    className="p-3 rounded-xl bg-white border border-gray-200 text-xs font-bold outline-none focus:border-[#6B0D24]"
                  />

                  <input
                    type="file"
                    accept="image/jpeg, image/png"
                    onChange={(e) => setNewSceneFile(e.target.files?.[0] || null)}
                    className="p-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#6B0D24] file:text-white cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleUploadScene}
                  disabled={uploading}
                  className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? 'Uploading High-Res Panoramic Image...' : '+ Upload 360° Room Photo'}
                </button>
              </div>

              {/* ROOM SCENES LIST */}
              <div className="space-y-3">
                {scenesList.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-6">
                    No 360° rooms uploaded yet. Upload a panoramic photo above to begin building the tour!
                  </p>
                ) : (
                  scenesList.map((scene) => (
                    <div
                      key={scene.id}
                      className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                    >
                      <div>
                        <h4 className="font-black text-gray-900 text-sm">{scene.name}</h4>
                        <span className="text-[10px] font-bold text-gray-400 block">
                          {scene.hotspots ? scene.hotspots.length : 0} Navigation Hotspots Placed
                        </span>
                      </div>

                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleOpenVisualEditor(scene.id)}
                          className="flex-1 sm:flex-none bg-[#FAF6F0] text-[#6B0D24] border border-[#6B0D24]/20 hover:bg-[#6B0D24] hover:text-white px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          🔗 Edit 3D Links
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteScene(scene.id, scene.url)}
                          className="flex-1 sm:flex-none bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          🗑️ Delete Room
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VISUAL 360 EDITOR MODAL OVERLAY */}
      {editorModalOpen && (
        <div className="fixed inset-0 z-[200000] bg-black flex flex-col animate-fadeIn">
          <div className="bg-gray-900 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-800 gap-3 z-10">
            <div>
              <h3 className="text-base font-black text-white">
                3D Navigation Editor
              </h3>
              <p className="text-xs text-gray-400">
                Double-click anywhere on the 360° photo below to place a navigation door.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <label className="text-xs font-bold text-[#C5A059] uppercase tracking-wider">
                Target Room:
              </label>
              <select
                id="hotspotTargetSelect"
                value={targetSceneId}
                onChange={(e) => setTargetSceneId(e.target.value)}
                className="p-2 rounded-xl bg-gray-800 border border-gray-700 text-white font-bold text-xs outline-none focus:border-[#C5A059]"
              >
                <option value="">-- Choose Target Room --</option>
                {scenesList
                  .filter((s) => s.id !== activeSceneId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>

              <button
                type="button"
                onClick={handleCloseVisualEditor}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Save & Close Editor
              </button>
            </div>
          </div>

          <div
            ref={editorCanvasContainerRef}
            className="flex-1 w-full bg-black cursor-crosshair relative flex items-center justify-center"
          >
            {loadingPano && (
              <div className="absolute z-20 text-center text-white space-y-2">
                <i className="ph-bold ph-spinner animate-spin text-4xl text-[#C5A059] block mx-auto"></i>
                <p className="text-xs font-black uppercase tracking-widest">Loading 360° Texture Canvas...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}