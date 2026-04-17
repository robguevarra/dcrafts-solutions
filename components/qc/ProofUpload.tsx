"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, CheckCircle2, AlertTriangle, X, Camera } from "lucide-react";

interface ProofUploadProps {
  jobId: string;
  onSuccess?: (proofUrl: string) => void;
}

type UploadState =
  | { status: "idle" }
  | { status: "compressing" }
  | { status: "uploading"; progress: number }
  | { status: "done"; url: string; shadowBlocked: boolean }
  | { status: "error"; message: string };

/**
 * T1.13 — QC Proof Photo Upload Component
 *
 * Client component used from KDS job cards and order detail page.
 * Compresses image client-side before upload (target < 2MB).
 * Calls POST /api/qc/upload with multipart form data.
 */
export function ProofUpload({ jobId, onSuccess }: ProofUploadProps) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      // Client-side type guard
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
      if (!allowed.includes(file.type)) {
        setState({ status: "error", message: `File type not allowed: ${file.type}` });
        return;
      }

      // Show preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);

      // Compress if > 2MB
      setState({ status: "compressing" });
      const compressed = await compressImage(file, 1920, 0.82);

      // Upload
      setState({ status: "uploading", progress: 0 });

      const form = new FormData();
      form.append("file", compressed, file.name);
      form.append("jobId", jobId);

      try {
        const res = await fetch("/api/qc/upload", { method: "POST", body: form });
        const json = await res.json();

        if (!res.ok) {
          setState({ status: "error", message: json.error ?? "Upload failed" });
          return;
        }

        setState({
          status: "done",
          url: json.proof_photo_url,
          shadowBlocked: json.auto_send_blocked,
        });
        onSuccess?.(json.proof_photo_url);
      } catch (err) {
        setState({ status: "error", message: String(err) });
      }
    },
    [jobId, onSuccess]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleReset = () => {
    setState({ status: "idle" });
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Render ──────────────────────────────────────────────

  if (state.status === "done") {
    return (
      <div className="space-y-2">
        {preview && (
          <img
            src={preview}
            alt="Proof photo"
            className="w-full object-cover"
            style={{ maxHeight: "200px", border: "1px solid var(--border-dim)" }}
          />
        )}
        <div
          className="flex items-center justify-between px-3 py-2 text-xs"
          style={{
            background: "color-mix(in srgb, var(--signal-green) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--signal-green) 25%, transparent)",
          }}
        >
          <div className="flex items-center gap-2" style={{ color: "var(--signal-green)" }}>
            <CheckCircle2 size={12} />
            <span>Proof uploaded</span>
          </div>
          {state.shadowBlocked && (
            <span style={{ color: "var(--signal-amber)" }}>
              Auto-send blocked (shadow mode)
            </span>
          )}
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          background: "color-mix(in srgb, var(--signal-red) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--signal-red) 25%, transparent)",
          color: "var(--signal-red)",
        }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} />
          {state.message}
        </div>
        <button onClick={handleReset}>
          <X size={12} />
        </button>
      </div>
    );
  }

  const isProcessing =
    state.status === "compressing" || state.status === "uploading";

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        className="flex flex-col items-center justify-center gap-2 p-6 cursor-pointer transition-colors"
        style={{
          border: `2px dashed ${
            isDragging ? "var(--signal-amber)" : "var(--border-dim)"
          }`,
          background: isDragging
            ? "color-mix(in srgb, var(--signal-amber) 5%, transparent)"
            : "var(--bg-raised)",
          color: "var(--text-dim)",
          opacity: isProcessing ? 0.6 : 1,
          pointerEvents: isProcessing ? "none" : "auto",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {isProcessing ? (
          <>
            <div
              className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--signal-amber)" }}
            />
            <span className="text-xs">
              {state.status === "compressing" ? "Compressing…" : "Uploading…"}
            </span>
          </>
        ) : (
          <>
            <Camera size={20} />
            <div className="text-center">
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Drop proof photo here
              </p>
              <p className="text-xs" style={{ fontSize: "11px" }}>
                or click to select · JPEG, PNG, WebP, HEIC
              </p>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={handleInputChange}
        disabled={isProcessing}
      />

      {/* Mobile camera button */}
      <button
        onClick={() => {
          if (inputRef.current) {
            inputRef.current.setAttribute("capture", "environment");
            inputRef.current.click();
          }
        }}
        disabled={isProcessing}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs transition-opacity disabled:opacity-40"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-dim)",
          color: "var(--text-secondary)",
        }}
      >
        <Upload size={12} />
        Take Photo
      </button>
    </div>
  );
}

// ── Image compression utility ───────────────────────────────

/**
 * Compress an image file to target maxWidth/quality using Canvas API.
 * Returns original file if canvas resizing not needed or fails.
 */
async function compressImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Skip compression if already small enough
      if (img.width <= maxWidth && file.size <= 2 * 1024 * 1024) {
        resolve(file);
        return;
      }

      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name, { type: "image/jpeg" });
          resolve(compressed);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fall back to original on error
    };

    img.src = url;
  });
}
