/**
 * 인앱 브라우저 감지 및 외부 브라우저 리다이렉트 유틸리티
 */

/**
 * 카카오톡, 라인 등 인앱 브라우저인지 감지
 */
export function isInAppBrowser(): boolean {
    if (typeof window === "undefined") return false;

    const ua = navigator.userAgent.toLowerCase();

    // 카카오톡
    if (ua.includes("kakaotalk")) return true;
    // 라인
    if (ua.includes("line/")) return true;
    // 페이스북
    if (ua.includes("fban") || ua.includes("fbav")) return true;
    // 인스타그램
    if (ua.includes("instagram")) return true;
    // 네이버
    if (ua.includes("naver")) return true;
    // 기타 WebView 패턴
    if (ua.includes("wv") && ua.includes("android")) return true;

    return false;
}

/**
 * Android 디바이스인지 감지
 */
export function isAndroid(): boolean {
    if (typeof window === "undefined") return false;
    return /android/i.test(navigator.userAgent);
}

/**
 * iOS 디바이스인지 감지
 */
export function isIOS(): boolean {
    if (typeof window === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Android에서 intent:// 스킴으로 외부 브라우저 열기
 * @param url 열려는 URL (기본값: 현재 페이지)
 */
export function openExternalBrowser(url?: string): void {
    const targetUrl = url || window.location.href;

    // Chrome intent 스킴으로 외부 브라우저 열기
    const intentUrl = `intent://${targetUrl.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;

    window.location.href = intentUrl;
}
