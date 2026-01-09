import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient, User } from "@supabase/supabase-js";

// =============================================================================
// Types
// =============================================================================

export interface ApiContext {
  user: User;
  supabase: SupabaseClient;
  request?: NextRequest;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type ApiHandler<T = unknown> = (ctx: ApiContext) => Promise<NextResponse<ApiResponse<T>>>;

// =============================================================================
// Response Helpers - 일관된 응답 형식
// =============================================================================

export function successResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(error: string, status = 500): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, error }, { status });
}

// =============================================================================
// Auth Wrapper - 인증 체크 자동화
// =============================================================================

/**
 * API 라우트 핸들러를 인증으로 감싸는 래퍼
 *
 * 사용 예시:
 * ```ts
 * export const GET = withAuth(async ({ user, supabase }) => {
 *   const { data } = await supabase.from("users").select("*").eq("id", user.id);
 *   return successResponse(data);
 * });
 * ```
 */
export function withAuth<T = unknown>(handler: ApiHandler<T>) {
  return async (request?: NextRequest): Promise<NextResponse> => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return errorResponse("Unauthorized", 401);
      }

      return await handler({ user, supabase, request });
    } catch (error) {
      console.error("[API Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  };
}

/**
 * 인증 없이 사용하는 API 핸들러 래퍼 (에러 핸들링만)
 */
export function withErrorHandling<T = unknown>(
  handler: (request?: NextRequest) => Promise<NextResponse<ApiResponse<T>>>
) {
  return async (request?: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      console.error("[API Error]", error);
      return errorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateRequired(
  fields: Record<string, unknown>,
  required: string[]
): string | null {
  for (const field of required) {
    if (fields[field] === undefined || fields[field] === null || fields[field] === "") {
      return `${field} is required`;
    }
  }
  return null;
}

export function validateId(id: string | null | undefined): string | null {
  if (!id) return "ID is required";
  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) return "Invalid ID format";
  return null;
}
