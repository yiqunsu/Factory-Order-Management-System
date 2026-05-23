"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ParsedOrder } from "@/lib/ai";

interface Props {
  onParsed: (result: ParsedOrder) => void;
}

export default function ImageUploadParser({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [status, setStatus] = useState("");  // progress message
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }
    setError("");
    setStatus("");
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleClear() {
    setPreview(null);
    setImageFile(null);
    setError("");
    setStatus("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleParse() {
    if (!imageFile) return;
    setParsing(true);
    setError("");

    try {
      // Step 1: OCR — extract text from image in browser
      setStatus("正在识别截图文字…");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("chi_sim+eng");
      const { data } = await worker.recognize(imageFile);
      await worker.terminate();

      const text = data.text.trim();
      if (!text) {
        setError("未能从截图中识别到文字，请确保截图清晰");
        return;
      }

      // Step 2: Send extracted text to DeepSeek for parsing
      setStatus("AI 正在解析订单信息…");
      const res = await fetch("/api/parse-order-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "解析失败，请重试");
        return;
      }

      const result: ParsedOrder = await res.json();
      setStatus("");
      onParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "识别失败，请重试");
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">微信截图识别</h2>
        <span className="text-xs text-slate-400">上传截图后点击识别，自动填入下方表单</span>
      </div>
      <div className="px-6 py-5">
        {!preview ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors ${
              dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50"
            }`}
          >
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            <div className="text-center">
              <p className="text-sm text-slate-500">拖拽截图到此处，或<span className="text-blue-600 font-medium">点击上传</span></p>
              <p className="text-xs text-slate-400 mt-1">支持 JPG、PNG、WebP</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="截图预览"
                className="w-32 h-32 object-cover rounded-lg border border-slate-200"
              />
              <button
                type="button"
                onClick={handleClear}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 flex flex-col gap-3 pt-1">
              {status ? (
                <p className="text-sm text-blue-600 flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {status}
                </p>
              ) : (
                <p className="text-sm text-slate-600">截图已上传，点击下方按钮让 AI 自动识别订单信息。</p>
              )}
              <Button
                type="button"
                onClick={handleParse}
                disabled={parsing}
                className="w-fit bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                {parsing ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    识别中…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    AI 识别截图
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}
