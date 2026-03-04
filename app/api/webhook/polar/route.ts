import { NextResponse, type NextRequest } from "next/server";
import { Webhooks } from "@polar-sh/nextjs";
import { createClient } from "@/lib/supabase/server";

interface PolarCustomerLike {
    id?: string | null;
    email?: string | null;
}

interface PolarSubscriptionLike {
    id?: string | null;
    status?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    customer?: PolarCustomerLike | null;
}

const getSubscriptionData = (payload: unknown): PolarSubscriptionLike => {
    if (!payload || typeof payload !== "object") return {};
    const data = "data" in payload ? (payload as { data?: unknown }).data : undefined;
    if (!data || typeof data !== "object") return {};
    return data as PolarSubscriptionLike;
};

const getFallbackPeriodEnd = (): string => {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    return expiresAt.toISOString();
};

const markPaidActive = async (customerEmail: string, data: PolarSubscriptionLike) => {
    const supabase = await createClient();
    const startedAt = data.current_period_start || new Date().toISOString();
    const periodEnd = data.current_period_end || getFallbackPeriodEnd();

    const { error } = await supabase
        .from("users")
        .update({
            // Keep existing Pro behavior for usage gating.
            promo_expires_at: periodEnd,
            // Dedicated payment analytics fields.
            is_paid_user: true,
            paid_ever: true,
            paid_started_at: startedAt,
            paid_ended_at: null,
            polar_customer_id: data.customer?.id || null,
            polar_subscription_id: data.id || null,
        })
        .eq("email", customerEmail);

    if (error) {
        console.error("Failed to update paid status(active):", error);
        return;
    }

    console.log(
        `User ${customerEmail} marked as paid active (subscription=${data.id || "unknown"}, periodEnd=${periodEnd})`,
    );
};

const markPaidInactive = async (customerEmail: string, data: PolarSubscriptionLike) => {
    const supabase = await createClient();
    const endedAt = new Date().toISOString();

    const { error } = await supabase
        .from("users")
        .update({
            // Keep existing Pro behavior for usage gating.
            promo_expires_at: null,
            // Dedicated payment analytics fields.
            is_paid_user: false,
            paid_ended_at: endedAt,
            polar_customer_id: data.customer?.id || null,
            polar_subscription_id: data.id || null,
        })
        .eq("email", customerEmail);

    if (error) {
        console.error("Failed to update paid status(inactive):", error);
        return;
    }

    console.log(
        `User ${customerEmail} marked as paid inactive (subscription=${data.id || "unknown"})`,
    );
};

const polarWebhookHandler = Webhooks({
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

    // 구독 활성화 시 Pro 상태 부여
    onSubscriptionActive: async (payload) => {
        console.log("Subscription activated:", payload);

        const data = getSubscriptionData(payload);
        const customerEmail = data.customer?.email;
        if (!customerEmail) {
            console.error("No customer email found in subscription");
            return;
        }

        await markPaidActive(customerEmail, data);
    },

    // 구독 취소 시 Pro 상태 해제
    onSubscriptionCanceled: async (payload) => {
        console.log("Subscription canceled:", payload);

        const data = getSubscriptionData(payload);
        const customerEmail = data.customer?.email;
        if (!customerEmail) return;

        await markPaidInactive(customerEmail, data);
    },

    // 구독 갱신 시 만료일 연장
    onSubscriptionUpdated: async (payload) => {
        console.log("Subscription updated:", payload);

        const data = getSubscriptionData(payload);
        const customerEmail = data.customer?.email;
        if (!customerEmail) return;

        const status = (data.status || "").toLowerCase();
        if (status === "active" || status === "trialing") {
            await markPaidActive(customerEmail, data);
            return;
        }

        // Keep this list explicit to avoid toggling on benign status updates.
        const inactiveStatuses = new Set(["canceled", "ended", "past_due", "unpaid", "incomplete_expired"]);
        if (inactiveStatuses.has(status)) {
            await markPaidInactive(customerEmail, data);
            return;
        }

        console.log(`Ignoring subscription update status for payment toggle: ${status || "unknown"}`);
    },
});

const extractUnknownEventType = (error: Error): string | null => {
    const messages: string[] = [error.message];
    const cause = (error as Error & { cause?: unknown }).cause;

    if (cause instanceof Error) {
        messages.push(cause.message);
    } else if (typeof cause === "string") {
        messages.push(cause);
    }

    for (const message of messages) {
        const match = message.match(/Unknown event type:\s*([a-zA-Z0-9_.-]+)/);
        if (match?.[1]) {
            return match[1];
        }
    }

    return null;
};

export const POST = async (request: NextRequest) => {
    try {
        return await polarWebhookHandler(request);
    } catch (error) {
        if (error instanceof Error) {
            const unsupportedEventType = extractUnknownEventType(error);
            if (unsupportedEventType) {
                console.warn(
                    `Ignoring unsupported Polar webhook event type: ${unsupportedEventType}`,
                );
                return NextResponse.json({ received: true, ignored: true });
            }
        }

        throw error;
    }
};
