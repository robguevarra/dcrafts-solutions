import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * T1.13 — QC Proof Photo Upload Route
 *
 * POST /api/qc/upload
 * Body: multipart/form-data  { file: File, jobId: string }
 *
 * Flow:
 * 1. Validate file (type + size)
 * 2. Upload to Supabase Storage `proofs/` bucket
 * 3. Update print_jobs: proof_photo_url = public URL, status = 'done'
 * 4. Shadow mode guard: proof_sent_at remains null until Gate 1 flipped
 */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const jobId = formData.get("jobId") as string | null;

  // ── Validation ─────────────────────────────────────────
  if (!file || !jobId) {
    return NextResponse.json({ error: "file and jobId are required" }, { status: 400 });
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `File type ${file.type} not allowed. Use JPEG, PNG, WebP, or HEIC.` },
      { status: 415 }
    );
  }

  const MAX_BYTES = 8 * 1024 * 1024; // 8MB server-side limit
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum 8MB." },
      { status: 413 }
    );
  }

  // ── Storage upload ──────────────────────────────────────
  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `${jobId}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("proofs")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true, // overwrite if re-uploading for same job
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // ── Get public URL ──────────────────────────────────────
  const { data: urlData } = supabase.storage
    .from("proofs")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // ── Update print_jobs ───────────────────────────────────
  const { error: dbError } = await supabase
    .from("print_jobs")
    .update({
      proof_photo_url: publicUrl,
      status: "done",
      // proof_sent_at intentionally left null — shadow mode guard
      // will be set to NOW() when Gate 1 is flipped and auto-send fires
    })
    .eq("id", jobId);

  if (dbError) {
    return NextResponse.json(
      { error: `DB update failed: ${dbError.message}` },
      { status: 500 }
    );
  }

  // ── Check shadow mode — log intent only ────────────────
  const { data: flagData } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("name", "shadow_mode")
    .single();

  const shadowMode = flagData?.enabled ?? true;

  return NextResponse.json({
    ok: true,
    proof_photo_url: publicUrl,
    shadow_mode: shadowMode,
    // When shadow_mode = false, caller should trigger CS API proof send
    auto_send_blocked: shadowMode,
  });
}
