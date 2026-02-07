import { withAuth, successResponse, errorResponse, validateRequired } from "@/lib/api";
import { CustomFormat, CustomFormatInsert } from "@/lib/types/database";
import { getCustomFormatLimit } from "@/lib/promo";

// GET /api/formats - List custom formats
export const GET = withAuth<{ formats: CustomFormat[] }>(async ({ user, supabase }) => {
  const { data: formats, error } = await supabase
    .from("custom_formats")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ formats: formats ?? [] });
});

// POST /api/formats - Create custom format
export const POST = withAuth<{ format: CustomFormat }>(async ({ user, supabase, request }) => {
  const body = await request!.json();
  const { name, prompt, is_default } = body;

  // Validation
  const validationError = validateRequired({ name, prompt }, ["name", "prompt"]);
  if (validationError) {
    return errorResponse(validationError, 400);
  }

  // Get user data for Pro status check and format count in parallel
  const [userResult, countResult] = await Promise.all([
    supabase.from("users").select("promo_expires_at").eq("id", user.id).single(),
    supabase.from("custom_formats").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const userData = userResult.data;
  const { count } = countResult;

  // Check format limit (Pro users have higher limit)
  const formatLimit = getCustomFormatLimit(userData);
  if (count !== null && count >= formatLimit) {
    return errorResponse("Maximum format limit reached", 400);
  }

  // If setting as default, clear existing default
  if (is_default) {
    await supabase
      .from("custom_formats")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const insertData: CustomFormatInsert = {
    user_id: user.id,
    name: name.trim(),
    prompt: prompt.trim(),
    is_default: is_default || false,
  };

  const { data: format, error } = await supabase
    .from("custom_formats")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ format });
});

// PUT /api/formats - Update format or set as default
export const PUT = withAuth<{ format: CustomFormat | null }>(async ({ user, supabase, request }) => {
  const body = await request!.json();
  const { id, name, prompt, is_default, clear_all_default } = body;

  // 스마트 포맷을 기본값으로 설정 (모든 커스텀 포맷의 is_default를 false로)
  if (clear_all_default) {
    await supabase
      .from("custom_formats")
      .update({ is_default: false })
      .eq("user_id", user.id);

    return successResponse({ format: null });
  }

  if (!id) {
    return errorResponse("Format ID is required", 400);
  }

  // If setting as default, clear existing default first
  if (is_default) {
    await supabase
      .from("custom_formats")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name.trim();
  if (prompt) updateData.prompt = prompt.trim();
  if (typeof is_default === "boolean") updateData.is_default = is_default;

  const { data: format, error } = await supabase
    .from("custom_formats")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ format });
});

// DELETE /api/formats - Delete a format
export const DELETE = withAuth<{ deleted: boolean }>(async ({ user, supabase, request }) => {
  const { searchParams } = new URL(request!.url);
  const id = searchParams.get("id");

  if (!id) {
    return errorResponse("Format ID is required", 400);
  }

  const { error } = await supabase
    .from("custom_formats")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ deleted: true });
});
