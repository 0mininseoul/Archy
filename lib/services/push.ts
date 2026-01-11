import webpush from 'web-push';

// VAPID 키 설정
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:contact@ascentum.co.kr';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  recordingId?: string;
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<boolean> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured, skipping push notification');
    return false;
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1시간
        urgency: 'normal',
      }
    );
    return true;
  } catch (error: any) {
    // 구독이 만료되거나 유효하지 않은 경우
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log('Push subscription expired or invalid');
      return false;
    }
    console.error('Failed to send push notification:', error);
    return false;
  }
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}
