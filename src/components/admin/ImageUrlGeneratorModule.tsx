'use client';

import React, { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface UploadHistoryItem {
  id: string;
  name: string;
  url: string;
  folder: string;
  uploadedAt: string;
}

export default function ImageUrlGeneratorModule() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [folderType, setFolderType] = useState<string>('thumbnails');
  const [uploading, setUploading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select an image file first!');
      return;
    }

    setUploading(true);
    setCopied(false);

    try {
      const timeStamp = Date.now();
      const cleanFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `uploads/${folderType}/${timeStamp}_${cleanFileName}`;
      const storageRef = ref(storage, storagePath);

      const snapshot = await uploadBytes(storageRef, selectedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      setGeneratedUrl(downloadURL);

      // Add to session history
      const newItem: UploadHistoryItem = {
        id: 'img_' + timeStamp,
        name: selectedFile.name,
        url: downloadURL,
        folder: folderType,
        uploadedAt: new Date().toLocaleTimeString(),
      };
      setHistory((prev) => [newItem, ...prev]);

      setSelectedFile(null);
      // Reset input element
      const fileInput = document.getElementById('mediaFileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      console.error('Upload Error:', err);
      alert('Upload failed: ' + (err.message || 'Check Firebase Storage permissions.'));
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = (urlText: string) => {
    navigator.clipboard.writeText(urlText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* HEADER BAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
          <i className="ph-bold ph-cloud-arrow-up text-xl"></i>
        </div>
        <div>
          <h2 className="text-base font-black text-gray-900">Image URL Generator &amp; Media Storage</h2>
          <p className="text-xs text-gray-500 font-medium">
            Upload images to Firebase Cloud Storage and generate public direct links for blogs, resorts, and galleries.
          </p>
        </div>
      </div>

      {/* BODY WITH INTERNAL SCROLL */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-6 overflow-y-auto shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* UPLOADER FORM (5 Cols) */}
          <div className="lg:col-span-5 bg-stone-50 border border-stone-200/80 p-6 rounded-2xl space-y-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-stone-200 pb-3">
              <i className="ph-bold ph-upload-simple text-blue-600 text-base"></i> Upload New File
            </h3>

            {/* File Drop Area */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                Select Image File
              </label>
              <input
                id="mediaFileInput"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full bg-white border-2 border-dashed border-gray-200 p-3.5 rounded-xl text-xs font-bold text-gray-700 cursor-pointer hover:border-blue-500 transition"
              />
              {selectedFile && (
                <p className="text-[11px] font-bold text-blue-600 mt-1.5">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* Folder / Target Type */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                Target Category / Folder
              </label>
              <select
                value={folderType}
                onChange={(e) => setFolderType(e.target.value)}
                className="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-xs text-gray-900 outline-none focus:border-blue-600"
              >
                <option value="thumbnails">Thumbnails (Small - Cards)</option>
                <option value="covers">Covers &amp; Banners (Large - Headers)</option>
                <option value="logos">Logos &amp; Icons</option>
                <option value="blogs">Blog Photos &amp; Content</option>
                <option value="general">General Media Uploads</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              className="w-full bg-gray-900 hover:bg-blue-600 text-white font-black py-3.5 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <i className="ph-bold ph-circle-notch animate-spin text-base"></i>
                  <span>Uploading to Firebase...</span>
                </>
              ) : (
                <>
                  <span>Upload &amp; Generate URL</span>
                  <i className="ph-bold ph-arrow-right text-base"></i>
                </>
              )}
            </button>

            {/* LATEST UPLOAD OUTPUT RESULT */}
            {generatedUrl && (
              <div className="pt-4 border-t border-stone-200 space-y-3">
                <span className="text-[10px] font-black text-green-700 uppercase tracking-widest block">
                  ✅ Upload Successful! Generated URL:
                </span>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={generatedUrl}
                    readOnly
                    className="flex-1 bg-white border border-gray-200 p-2.5 rounded-xl text-xs font-mono text-gray-700 outline-none select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(generatedUrl)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2.5 rounded-xl text-xs transition cursor-pointer shrink-0"
                  >
                    {copied ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>

                <div className="rounded-xl overflow-hidden border border-gray-200 h-40 bg-gray-100">
                  <img src={generatedUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>

          {/* SESSION UPLOAD HISTORY (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">
                Session Upload History ({history.length})
              </h3>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-[11px] font-bold text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-xs font-bold uppercase tracking-wider">
                No uploads in this session yet. Select an image on the left to generate its URL.
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-50 border border-gray-200 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 border border-gray-200 bg-white"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-gray-900 truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium mt-0.5">
                          <span className="uppercase font-bold text-blue-600">{item.folder}</span>
                          <span>&bull;</span>
                          <span>{item.uploadedAt}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(item.url)}
                      className="bg-white hover:bg-gray-100 border border-gray-200 text-gray-800 font-bold px-3 py-2 rounded-xl text-xs transition shrink-0 cursor-pointer"
                    >
                      📋 Copy URL
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}