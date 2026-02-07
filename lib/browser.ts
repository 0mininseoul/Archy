/**
 * 인앱 브라우저 감지 및 외부 브라우저 리다이렉트 유틸리티
 */

/**
 * 인앱 브라우저 타입
 */
export type InAppBrowserType =
    | "kakaotalk"
    | "line"
    | "facebook"
    | "instagram"
    | "threads"
    | "linkedin"
    | "naver"
    | "telegram"
    | "twitter"
    | "snapchat"
    | "tiktok"
    | "unknown-webview"
    | null;

/**
 * 인앱 브라우저 타입을 구체적으로 감지
 * @returns 감지된 앱 타입 또는 null (일반 브라우저인 경우)
 */
export function detectInAppBrowserType(): InAppBrowserType {
    if (typeof window === "undefined") return null;

    const ua = navigator.userAgent;
    const uaLower = ua.toLowerCase();

    // 카카오톡
    if (uaLower.includes("kakaotalk")) return "kakaotalk";
    // 라인
    if (uaLower.includes("line/")) return "line";
    // 인스타그램 (쓰레드보다 먼저 체크 - 쓰레드도 Instagram 포함할 수 있음)
    if (uaLower.includes("instagram")) return "instagram";
    // 쓰레드 (Barcelona는 Threads의 코드명)
    if (uaLower.includes("threads") || ua.includes("Barcelona")) return "threads";
    // 페이스북
    if (uaLower.includes("fban") || uaLower.includes("fbav") || uaLower.includes("fb_iab")) return "facebook";
    // 링크드인
    if (uaLower.includes("linkedin")) return "linkedin";
    // 네이버
    if (uaLower.includes("naver")) return "naver";
    // 텔레그램
    if (uaLower.includes("telegram")) return "telegram";
    // 트위터/X
    if (uaLower.includes("twitter") || ua.includes("TwitterAndroid")) return "twitter";
    // 스냅챗
    if (uaLower.includes("snapchat")) return "snapchat";
    // 틱톡
    if (uaLower.includes("tiktok") || uaLower.includes("musical_ly") || uaLower.includes("bytedance")) return "tiktok";

    // 기타 WebView 패턴 감지
    // Android WebView
    if (uaLower.includes("wv") && uaLower.includes("android")) return "unknown-webview";
    // iOS WebView (WKWebView 또는 UIWebView 감지)
    // Safari가 아닌데 iOS인 경우
    if (/iphone|ipad|ipod/i.test(ua)) {
        // Safari 브라우저가 아닌 경우 (Safari 제외)
        const isSafari = /safari/i.test(ua) && !/crios|fxios|opios|edgios/i.test(ua);
        const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
        // Safari가 아니고, PWA 모드도 아닌 경우 WebView로 간주
        if (!isSafari && !isStandalone) return "unknown-webview";
    }

    return null;
}

/**
 * 카카오톡, 라인 등 인앱 브라우저인지 감지
 */
export function isInAppBrowser(): boolean {
    return detectInAppBrowserType() !== null;
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
