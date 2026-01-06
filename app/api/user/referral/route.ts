import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET - 내 레퍼럴 코드 조회
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error } = await supabase
      .from("users")
      .select("referral_code, bonus_minutes")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Failed to get referral code:", error);
      return NextResponse.json(
        { error: "Failed to get referral code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      referralCode: userData.referral_code,
      bonusMinutes: userData.bonus_minutes || 0,
    });
  } catch (error) {
    console.error("Referral GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - 레퍼럴 코드 입력 (보너스 지급)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { referralCode } = await request.json();

    if (!referralCode || referralCode.length !== 8) {
      return NextResponse.json(
        { error: "Invalid referral code" },
        { status: 400 }
      );
    }

    // 현재 유저 정보 확인
    const { data: currentUser } = await supabase
      .from("users")
      .select("referred_by, referral_code")
      .eq("id", user.id)
      .single();

    // 이미 레퍼럴 코드를 입력한 경우
    if (currentUser?.referred_by) {
      return NextResponse.json(
        { error: "Referral code already used" },
        { status: 400 }
      );
    }

    // 자기 자신의 코드인 경우
    if (currentUser?.referral_code === referralCode.toUpperCase()) {
      return NextResponse.json(
        { error: "Cannot use your own referral code" },
        { status: 400 }
      );
    }

    // 레퍼럴 코드로 추천인 찾기
    const { data: referrer, error: referrerError } = await supabase
      .from("users")
      .select("id, bonus_minutes")
      .eq("referral_code", referralCode.toUpperCase())
      .single();

    if (referrerError || !referrer) {
      return NextResponse.json(
        { error: "Referral code not found" },
        { status: 404 }
      );
    }

    // 트랜잭션처럼 처리 (순차적으로)
    // 1. 현재 유저에게 보너스 지급 및 referred_by 설정
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        referred_by: referrer.id,
        bonus_minutes: 350,
      })
      .eq("id", user.id);

    if (userUpdateError) {
      console.error("Failed to update user:", userUpdateError);
      return NextResponse.json(
        { error: "Failed to apply referral" },
        { status: 500 }
      );
    }

    // 2. 추천인에게도 보너스 지급
    const { error: referrerUpdateError } = await supabase
      .from("users")
      .update({
        bonus_minutes: (referrer.bonus_minutes || 0) + 350,
      })
      .eq("id", referrer.id);

    if (referrerUpdateError) {
      console.error("Failed to update referrer:", referrerUpdateError);
      // 이미 현재 유저에게는 적용됐으므로 에러 반환하지 않음
    }

    return NextResponse.json({
      success: true,
      bonusMinutes: 350,
      message: "Referral applied successfully! You and your friend both received 350 bonus minutes.",
    });
  } catch (error) {
    console.error("Referral POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
