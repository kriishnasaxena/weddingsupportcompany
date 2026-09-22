'use client';

import React, { useState, useEffect } from 'react';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { extractCoverImage } from '@/lib/pricing';

interface PartnerGalleryProps {
  resortId: string;
  resortData: any;
  partnerData?: any;
  onUpdateSuccess: () => void;
}

export default function PartnerGallery({
  resortId,
  resortData,
  partnerData,
  onUpdateSuccess,
}: PartnerGalleryProps) {
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Extract current live images
  useEffect(() => {
    if (!resortData) return;

    const collected: string[] = [];
    Object.keys(resortData).forEach((key) => {
      if (
        typeof resortData[key] === 'string' &&
        resortData[key].includes('firebasestorage.googleapis.com')
      ) {
        const urls = resortData[key].split(',').map((u: string) => u.trim()).filter(Boolean);
        urls.forEach((url: string) => {
          if (!collected.includes(url)) collected.push(url);
        });
      }
    });

    if (collected.length === 0) {
      collected.push(extractCoverImage(resortData));
    }

    setImages(collected);

    // Check for pending image approval request
    const checkPending = async () => {
      try {
        const reqQ = query(
          collection(db, 'partner_approval_requests'),
          where('resortId', '==', resortId),
          where('type', '==', 'gallery_update'),
          where('status', '==', 'pending')
        );
        const reqSnap = await getDocs(reqQ);
        if (!reqSnap.empty) {
          setPendingRequest(reqSnap.docs[0].data());
        } else {
          setPendingRequest(null);
        }
      } catch (e) {}
    };

    checkPending();
  }, [resortData, resortId]);

  // Upload photo files to Firebase Storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setMessage(null);

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `resort_gallery/${resortId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        uploadedUrls.push(downloadUrl);
      }

      setImages((prev) => [...prev, ...uploadedUrls]);
      setMessage({ type: 'error', text: `Uploaded ${uploadedUrls.length} image(s). Click 'Submit Gallery for Admin Approval' to push changes live.` });
    } catch (err: any) {
      console.error('Storage Upload Error:', err);
      setMessage({ type: 'error', text: 'Image upload failed. You can also paste image URLs directly.' });
    } finally {
      setUploading(false);
    }
  };

  // Add Image URL Manually
  const handleAddUrl = () => {
    if (!newImageUrl.trim()) return;
    setImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
    setMessage({ type: 'error', text: 'Image added. Click "Submit Gallery for Admin Approval" to save changes.' });
  };

  // Remove Image (Shows Pending Submit Notice)
  const handleRemoveImage = (index: number) => {
    if (images.length <= 1) {
      alert('⚠️ At least 1 cover image is required.');
      return;
    }
    const updated = images.filter((_, idx) => idx !== index);
    setImages(updated);
    setMessage({
      type: 'error',
      text: '⚠️ Photo removed. Click "Submit Gallery for Admin Approval" below to send this deletion request to Super Admin.',
    });
  };

  // Submit Gallery for Super Admin Approval
  const handleSubmitGalleryForApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (images.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least 1 image.' });
      return;
    }

    setSaving(true);

    try {
      const requestId = `req_gallery_${resortId}_${Date.now()}`;

      const requestPayload = {
        id: requestId,
        resortId,
        resortName: resortData._recordName || resortData.core_name || 'Resort',
        partnerId: partnerData?.id || partnerData?.uid || 'partner_id',
        partnerName: partnerData?.partnerName || 'Resort Partner',
        type: 'gallery_update',
        proposedImages: images,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'partner_approval_requests', requestId), requestPayload);

      setPendingRequest(requestPayload);
      setMessage({
        type: 'success',
        text: '✅ Gallery update submitted! Pending Super Admin approval before going live.',
      });
      onUpdateSuccess();
    } catch (err: any) {
      console.error('Error submitting gallery request:', err);
      setMessage({ type: 'error', text: 'Failed to submit image updates.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 pb-4 flex justify-between items-center">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900">
            Resort Gallery & Cover Images
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Upload or delete photos for your property. Admin approves all changes before going live.
          </p>
        </div>
      </div>

      {/* PENDING APPROVAL NOTICE */}
      {pendingRequest && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs font-medium space-y-1">
          <div className="flex items-center gap-2 font-black text-amber-950">
            <i className="ph-bold ph-hourglass text-base text-amber-600 animate-pulse"></i>
            <span>Pending Super Admin Image Approval</span>
          </div>
          <p>
            You submitted image changes on{' '}
            <strong>{new Date(pendingRequest.submittedAt).toLocaleString()}</strong>. Photos will update on your live resort page once approved.
          </p>
        </div>
      )}

      {message && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          <i className="ph-bold ph-info text-base"></i>
          <span>{message.text}</span>
        </div>
      )}

      {/* UPLOAD CONTROLS */}
      <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">
              Upload Photo Files
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-xs text-gray-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#6B0D24] file:text-white hover:file:bg-[#520a1a] file:cursor-pointer cursor-pointer bg-white border border-gray-200 rounded-xl p-1"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">
              Or Add Image URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 bg-white border border-gray-200 rounded-xl p-2.5 text-xs font-bold text-gray-800 outline-none"
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold shrink-0"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        {uploading && (
          <p className="text-xs text-[#6B0D24] font-bold flex items-center gap-1.5 animate-pulse">
            <i className="ph-bold ph-spinner animate-spin"></i> Uploading photos to secure storage...
          </p>
        )}
      </div>

      {/* PREVIEW IMAGE GRID */}
      <form onSubmit={handleSubmitGalleryForApproval} className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((imgUrl, idx) => (
            <div
              key={idx}
              className="relative group h-36 bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 shadow-2xs"
            >
              <img src={imgUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
              {idx === 0 && (
                <span className="absolute top-2 left-2 bg-[#6B0D24] text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-2xs">
                  Cover Photo
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-gray-600 hover:text-red-600 w-7 h-7 rounded-full flex items-center justify-center transition shadow-2xs"
                title="Remove Image"
              >
                <i className="ph-bold ph-trash text-xs"></i>
              </button>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={saving || uploading}
          className="bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black px-8 py-4 rounded-2xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <i className="ph-bold ph-spinner animate-spin text-base"></i> Submitting...
            </>
          ) : (
            <>
              <i className="ph-bold ph-paper-plane-tilt text-base text-[#C5A059]"></i> Submit Gallery for Admin Approval
            </>
          )}
        </button>
      </form>
    </div>
  );
}