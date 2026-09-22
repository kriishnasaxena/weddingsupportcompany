'use client';

import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function BlogManagerModule() {
  // Input fields
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [inBlogImages, setInBlogImages] = useState('');
  const [publishDate, setPublishDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [blogStatus, setBlogStatus] = useState<'Published' | 'Draft'>('Published');

  // AI & Generation State
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState('');

  // Extracted SEO Metadata
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [readingTime, setReadingTime] = useState<number>(3);
  const [keywords, setKeywords] = useState<string[]>([]);

  // Active View Tab: 'editor' | 'preview'
  const [activeViewTab, setActiveViewTab] = useState<'editor' | 'preview'>('editor');
  const [saving, setSaving] = useState(false);

  // --- GEMINI AI GENERATION ---
  const handleGenerateAIBlog = async () => {
    if (!topic.trim()) {
      alert('Please enter a Blog Topic / Title Idea!');
      return;
    }

    setGenerating(true);

    const imagesList = inBlogImages
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    const prompt = `
    You are an expert SEO blog writer and web developer for wedding and luxury resort venues. Write a highly engaging, modern blog post about: "${topic}".
    Additional context/brief/target keywords: "${brief}".
    
    REQUIREMENTS:
    1. Output ONLY raw HTML. No markdown code blocks like \`\`\`html.
    2. Do NOT include html, head, or body tags. Just internal article content tags.
    3. Use semantic HTML5 tags: article, h2, h3, p, ul, li, blockquote.
    4. Style everything using standard Tailwind CSS classes for high visual appeal.
    5. Ensure paragraphs have generous line height (leading-relaxed, text-gray-700, mb-6). Headings must be bold and distinct (text-2xl font-black text-gray-900 mt-8 mb-4).
    6. Include these image URLs smoothly inside the content where relevant: ${
      imagesList.length > 0 ? imagesList.join(' | ') : 'None provided'
    }. Format them with Tailwind classes like "w-full rounded-2xl shadow-md my-8 object-cover max-h-[450px]". Add descriptive SEO alt tags.
    7. Start the response with a hidden JSON block containing SEO metadata using these exact markers:
       |||META_START||| {"seo_title": "...", "meta_description": "...", "reading_time_minutes": 4, "keywords": ["keyword1", "keyword2"]} |||META_END|||
    `;

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Extract SEO Metadata if present
      let cleanContent = textOutput;
      const startMarker = '|||META_START|||';
      const endMarker = '|||META_END|||';
      const startIndex = textOutput.indexOf(startMarker);

      if (startIndex !== -1) {
        const endIndex = textOutput.indexOf(endMarker, startIndex);
        if (endIndex !== -1) {
          const jsonString = textOutput
            .substring(startIndex + startMarker.length, endIndex)
            .trim();
          try {
            const meta = JSON.parse(jsonString);
            setSeoTitle(meta.seo_title || topic);
            setMetaDescription(meta.meta_description || '');
            setReadingTime(meta.reading_time_minutes || 3);
            setKeywords(meta.keywords || []);
          } catch (e) {
            console.warn('Could not parse AI JSON metadata.', e);
          }
          cleanContent =
            textOutput.substring(0, startIndex) +
            textOutput.substring(endIndex + endMarker.length);
        }
      }

      setGeneratedHtml(cleanContent.trim());
      setActiveViewTab('preview'); // Switch to preview tab so user sees output immediately
      alert('✨ Blog generated successfully! You can now edit text, preview, adjust images, and publish.');
    } catch (err: any) {
      console.error('AI Generation Error:', err);
      alert('Failed to generate blog: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Insert image tag at cursor position or end of content
  const insertImageTag = (imgUrl: string) => {
    if (!imgUrl) return;
    const tag = `\n<img src="${imgUrl}" alt="Blog Photo" class="w-full rounded-2xl shadow-md my-8 object-cover max-h-[450px]" />\n`;
    setGeneratedHtml((prev) => prev + tag);
  };

  // --- SAVE TO FIREBASE ---
  const handleSaveBlogToFirebase = async () => {
    if (!topic.trim()) {
      alert('Missing Blog Title/Topic!');
      return;
    }
    if (!generatedHtml.trim()) {
      alert('Content is empty! Please write or generate blog content.');
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'blogs'), {
        title: topic.trim(),
        seo_title: seoTitle.trim() || topic.trim(),
        meta_description: metaDescription.trim(),
        thumbnail_url: thumbnailUrl.trim(),
        content: generatedHtml.trim(),
        reading_time: readingTime,
        keywords: keywords,
        publish_date: new Date(publishDate).toISOString(),
        status: blogStatus,
        created_at: new Date().toISOString(),
      });

      alert('✅ Blog successfully saved to database!');

      // Reset form
      setTopic('');
      setBrief('');
      setInBlogImages('');
      setGeneratedHtml('');
      setSeoTitle('');
      setMetaDescription('');
      setKeywords([]);
    } catch (err: any) {
      console.error('Error saving to Firebase:', err);
      alert('Error saving blog: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const parsedImagesList = inBlogImages
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[850px] space-y-4 overflow-hidden">
      {/* HEADER BANNER */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6B0D24] rounded-xl flex items-center justify-center text-white font-bold shadow-xs shrink-0">
            <i className="ph-bold ph-sparkle text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900">AI Blog Co-Pilot &amp; Manager</h2>
            <p className="text-xs text-gray-500 font-medium">
              Generate SEO articles with Gemini AI, edit HTML text live, preview rendering, and publish.
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveBlogToFirebase}
          disabled={saving}
          className="bg-[#6B0D24] hover:bg-[#520a1a] text-white text-xs font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
        >
          <i className="ph-bold ph-floppy-disk text-sm"></i>
          <span>{saving ? 'Saving...' : 'Publish to Database'}</span>
        </button>
      </div>

      {/* MAIN TWO-COLUMN SPLIT CONTAINER WITH SCROLL */}
      <div className="flex-1 bg-white border border-gray-200 rounded-2xl p-5 overflow-y-auto shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT PANEL: PROMPT & METADATA INPUTS (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#6B0D24] border-b pb-2">
              1. Article Prompt &amp; Media Inputs
            </h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Blog Topic / Title Idea *</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Top 5 Resort Wedding Trends in 2026"
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-[#6B0D24] font-bold bg-gray-50 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Brief &amp; Target Keywords</label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Keywords to use: Haridwar resorts, budget wedding. Key points: Mention eco-friendly decor..."
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-[#6B0D24] bg-gray-50 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Main Cover Thumbnail URL</label>
              <input
                type="text"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
                className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#6B0D24] bg-gray-50 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                In-Blog Image URLs (Comma separated)
              </label>
              <textarea
                value={inBlogImages}
                onChange={(e) => setInBlogImages(e.target.value)}
                rows={2}
                placeholder="https://img1.jpg, https://img2.jpg"
                className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:border-[#6B0D24] bg-gray-50 text-xs"
              />
            </div>

            <button
              onClick={handleGenerateAIBlog}
              disabled={generating}
              className="w-full bg-[#6B0D24] hover:bg-[#520a1a] text-white font-black py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              <i className="ph-bold ph-magic-wand text-base"></i>
              <span>{generating ? 'AI Writing Article...' : 'Generate Article with AI'}</span>
            </button>

            {/* QUICK IMAGE INSERTION HELPER */}
            {parsedImagesList.length > 0 && (
              <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl space-y-2">
                <span className="text-[10px] font-black uppercase text-stone-600 block">
                  📷 In-Blog Images Helper (Click to append tag)
                </span>
                <div className="flex flex-wrap gap-2">
                  {parsedImagesList.map((imgUrl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => insertImageTag(imgUrl)}
                      className="text-[10px] bg-white border border-gray-300 font-bold px-2 py-1 rounded hover:bg-gray-100 transition cursor-pointer truncate max-w-[150px]"
                      title={imgUrl}
                    >
                      + Insert Image #{i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SEO METADATA CONTROLS */}
            <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-3 pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
                ⚙️ SEO &amp; Publishing Settings
              </span>

              <div>
                <label className="block text-[10px] font-bold text-gray-500">SEO Title</label>
                <input
                  type="text"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500">Meta Description</label>
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500">Publish Date</label>
                  <input
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500">Status</label>
                  <select
                    value={blogStatus}
                    onChange={(e) => setBlogStatus(e.target.value as any)}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-bold"
                  >
                    <option value="Published">Published</option>
                    <option value="Draft">Draft</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: EDIT CONTENT & LIVE PREVIEW (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-3 min-h-[500px]">
            {/* VIEW TAB SWITCHER */}
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-900">
                2. Content Editor &amp; Visual Preview
              </h3>

              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveViewTab('editor')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeViewTab === 'editor'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-black'
                  }`}
                >
                  📝 Edit HTML
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('preview')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeViewTab === 'preview'
                      ? 'bg-[#6B0D24] text-white shadow-xs'
                      : 'text-gray-500 hover:text-black'
                  }`}
                >
                  👁️ Visual Preview
                </button>
              </div>
            </div>

            {/* TAB CONTENT 1: HTML CODE EDITOR */}
            {activeViewTab === 'editor' && (
              <div className="flex-1 flex flex-col space-y-2">
                <textarea
                  value={generatedHtml}
                  onChange={(e) => setGeneratedHtml(e.target.value)}
                  placeholder="Generated HTML code will appear here... You can edit text, headers, and image tags directly!"
                  className="w-full flex-1 p-4 border border-gray-800 rounded-2xl text-xs font-mono bg-gray-900 text-green-400 outline-none leading-relaxed min-h-[400px]"
                />
                <p className="text-[10px] text-gray-400 italic">
                  💡 Tip: You can edit text, headings, or add Tailwind CSS classes directly in the editor above.
                </p>
              </div>
            )}

            {/* TAB CONTENT 2: LIVE RENDERED VISUAL PREVIEW */}
            {activeViewTab === 'preview' && (
              <div className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl p-6 overflow-y-auto max-h-[550px] space-y-4">
                {thumbnailUrl && (
                  <img
                    src={thumbnailUrl}
                    alt="Cover Thumbnail"
                    className="w-full h-56 object-cover rounded-2xl mb-4 shadow-sm"
                  />
                )}

                <h1 className="text-2xl font-black text-gray-900">{topic || 'Blog Article Title'}</h1>

                <div className="flex items-center gap-3 text-xs text-gray-500 font-medium border-b pb-3 mb-4">
                  <span>📅 {publishDate}</span>
                  <span>⏱️ {readingTime} min read</span>
                  <span className="bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded text-[10px]">
                    {blogStatus}
                  </span>
                </div>

                {generatedHtml ? (
                  <article
                    className="prose prose-stone max-w-none text-xs leading-relaxed text-gray-800"
                    dangerouslySetInnerHTML={{ __html: generatedHtml }}
                  />
                ) : (
                  <p className="text-xs text-gray-400 italic py-12 text-center">
                    No generated content yet. Fill in topic/brief on the left and click &quot;Generate Article with AI&quot;.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}