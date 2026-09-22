'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
} from 'firebase/auth';
import { db, auth } from '@/lib/firebase';

export default function ResortPartnerLoginPage() {
  const router = useRouter();

  // Mode: 'login' (Email/Phone + Password) vs 'activate' (First Time Password Setup)
  const [mode, setMode] = useState<'login' | 'activate'>('login');

  // Password Login State
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Email or Phone
  const [loginPassword, setLoginPassword] = useState('');

  // First Time Activation OTP State
  const [actStep, setActStep] = useState<'phone' | 'otp' | 'set_password'>('phone');
  const [actPhone, setActPhone] = useState('');
  const [actOtp, setActOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resendTimer, setResendTimer] = useState<number>(40);

  const [partnerDocData, setPartnerDocData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // 40-Second Resend OTP Timer
  useEffect(() => {
    let interval: any = null;
    if (mode === 'activate' && actStep === 'otp' && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (actStep !== 'otp') {
      setResendTimer(40);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, actStep, resendTimer]);

  // --- 1. EXISTING PARTNER LOGIN (Email OR Phone + Password) ---
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setError('Please enter your registered Email/Phone and Password.');
      return;
    }

    setLoading(true);

    try {
      const cleanInput = loginIdentifier.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '');

      // Search resort_partners collection for matching email OR phone
      const qEmail = query(collection(db, 'resort_partners'), where('email', '==', cleanInput));
      const qPhone = query(collection(db, 'resort_partners'), where('phone', '==', cleanInput));

      const [snapEmail, snapPhone] = await Promise.all([getDocs(qEmail), getDocs(qPhone)]);
      let partnerDoc = snapEmail.docs[0] || snapPhone.docs[0];

      if (!partnerDoc || !partnerDoc.exists()) {
        setError('No Resort Partner account found for this Email or Phone.');
        setLoading(false);
        return;
      }

      const pData = partnerDoc.data();

      // Check if password matches
      if (pData.password !== loginPassword) {
        setError('Incorrect password.');
        setLoading(false);
        return;
      }

      if (pData.status === 'pending_password') {
        setError('Account is not activated yet. Please click "First Time Partner? Create Password" below.');
        setLoading(false);
        return;
      }

      // Save Session to localStorage
      localStorage.setItem('wsc_resort_partner', JSON.stringify(pData));
      router.push('/resort-partner');
    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Failed to log in.');
    } finally {
      setLoading(false);
    }
  };

  // --- 2. FIRST-TIME PARTNER ACTIVATION: SEND OTP ---
  const handleSendActivationOTP = async () => {
    setError('');
    const cleanPhone = actPhone.trim().replace(/[^0-9]/g, '');

    if (cleanPhone.length < 10) {
      setError('Please enter your 10-digit registered mobile number.');
      return;
    }

    setLoading(true);

    try {
      // Check if partner exists in Firestore
      const qPhone = query(collection(db, 'resort_partners'), where('phone', '==', cleanPhone));
      const snapPhone = await getDocs(qPhone);

      if (snapPhone.empty) {
        setError('Mobile number is not registered as a Resort Partner by WSC Admin.');
        setLoading(false);
        return;
      }

      const partnerRecord = snapPhone.docs[0].data();
      setPartnerDocData(partnerRecord);

      // Clear DOM container to prevent reCAPTCHA render collision
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch (e) {}
        (window as any).recaptchaVerifier = null;
      }

      const container = document.getElementById('partner-recaptcha-container');
      if (container) container.innerHTML = '';

      const verifier = new RecaptchaVerifier(auth, 'partner-recaptcha-container', {
        size: 'invisible',
        callback: () => {},
      });
      (window as any).recaptchaVerifier = verifier;

      await verifier.render();

      const result = await signInWithPhoneNumber(auth, '+91' + cleanPhone, verifier);
      setConfirmationResult(result);
      setResendTimer(40);
      setActStep('otp');
    } catch (err: any) {
      console.error('OTP Error:', err);
      setError(err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  // --- 3. VERIFY ACTIVATION OTP ---
  const handleVerifyActivationOTP = async () => {
    if (actOtp.length !== 6) {
      setError('Please enter 6-digit OTP code.');
      return;
    }
    setLoading(true);

    try {
      if (confirmationResult) {
        await confirmationResult.confirm(actOtp);
        setActStep('set_password');
      }
    } catch (err) {
      setError('Invalid OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // --- 4. SET PASSWORD & ACTIVATE ACCOUNT ---
  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (!partnerDocData || !partnerDocData.id) return;

      const updatedPartner = {
        ...partnerDocData,
        password: newPassword.trim(),
        status: 'active',
        activatedAt: new Date().toISOString(),
      };

      // Update Firestore document
      await updateDoc(doc(db, 'resort_partners', partnerDocData.id), {
        password: newPassword.trim(),
        status: 'active',
        activatedAt: new Date().toISOString(),
      });

      // Store partner session in localStorage
      localStorage.setItem('wsc_resort_partner', JSON.stringify(updatedPartner));
      router.push('/resort-partner');
    } catch (err: any) {
      console.error('Password Save Error:', err);
      setError(err.message || 'Failed to save password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col justify-center items-center p-4 font-sans text-gray-900 relative">
      <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#6B0D24]/10 text-[#6B0D24] flex items-center justify-center mx-auto mb-3 border border-[#6B0D24]/20 shadow-xs">
            <i className="ph-fill ph-buildings text-3xl"></i>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A059] block mb-1">
            Resort Partner Portal
          </span>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {mode === 'login' ? 'Partner Login' : 'Activate Account'}
          </h1>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
            <i className="ph-bold ph-warning-circle text-base text-red-600 shrink-0"></i>
            <span>{error}</span>
          </div>
        )}

        {/* ================= MODE 1: EXISTING PARTNER LOGIN ================= */}
        {mode === 'login' && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                Email or Mobile Number
              </label>
              <input
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="rajesh@resort.com or 9876543210"
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 font-bold text-sm outline-none focus:border-[#6B0D24] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 font-bold text-sm outline-none focus:border-[#6B0D24] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-4 rounded-2xl transition shadow-lg text-xs uppercase tracking-wider cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('activate');
                setError('');
              }}
              className="w-full text-xs font-bold text-[#6B0D24] hover:underline text-center pt-2"
            >
              First Time Partner? Activate & Create Password
            </button>
          </form>
        )}

        {/* ================= MODE 2: FIRST TIME ACTIVATION ================= */}
        {mode === 'activate' && (
          <div className="space-y-4">
            {actStep === 'phone' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Registered Mobile Number
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-4 flex items-center font-black text-gray-500 text-sm">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={actPhone}
                      onChange={(e) => setActPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 pl-14 pr-4 font-bold text-sm outline-none focus:border-[#6B0D24]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendActivationOTP}
                  disabled={loading}
                  className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-4 rounded-2xl transition shadow-lg text-xs uppercase tracking-wider"
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </div>
            )}

            {actStep === 'otp' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">
                    Enter 6-Digit Verification OTP
                  </label>
                  <input
                    type="number"
                    value={actOtp}
                    onChange={(e) => setActOtp(e.target.value)}
                    placeholder="------"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 text-center text-2xl font-black tracking-[0.6em] outline-none focus:border-[#6B0D24]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVerifyActivationOTP}
                  disabled={loading}
                  className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-4 rounded-2xl transition shadow-lg text-xs uppercase tracking-wider"
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <div className="flex justify-between items-center text-xs font-bold pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (resendTimer === 0) handleSendActivationOTP();
                    }}
                    disabled={resendTimer > 0 || loading}
                    className="text-[#6B0D24] hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActStep('phone')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    Change Number
                  </button>
                </div>
              </div>
            )}

            {actStep === 'set_password' && (
              <form onSubmit={handleSaveNewPassword} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Create New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 font-bold text-sm outline-none focus:border-[#6B0D24]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl transition shadow-lg text-xs uppercase tracking-wider"
                >
                  {loading ? 'Saving...' : 'Set Password & Launch Dashboard'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className="w-full text-xs font-bold text-gray-500 hover:underline text-center pt-2"
            >
              Back to Password Login
            </button>
          </div>
        )}

        <div id="partner-recaptcha-container" />
      </div>
    </div>
  );
}