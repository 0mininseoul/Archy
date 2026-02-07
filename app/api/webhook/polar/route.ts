import { Webhooks } from "@polar-sh/nextjs";
import { createClient } from "@/lib/supabase/server";

export const POST = Webhooks({
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

    // 구독 활성화 시 Pro 상태 부여
    onSubscriptionActive: async (payload) => {
        console.log("Subscription activated:", payload);

        const customerEmail = payload.data.customer.email;
        if (!customerEmail) {
            console.error("No customer email found in subscription");
            return;
        }

        const supabase = await createClient();

        // 구독 만료일 계산 (1달 후)
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const { error } = await supabase
            .from("users")
            .update({
                promo_expires_at: expiresAt.toISOString(),
            })
            .eq("email", customerEmail);

        if (error) {
            console.error("Failed to update user Pro status:", error);
        } else {
            console.log(`User ${customerEmail} upgraded to Pro until ${expiresAt}`);
        }
    },

    // 구독 취소 시 Pro 상태 해제
    onSubscriptionCanceled: async (payload) => {
        console.log("Subscription canceled:", payload);

        const customerEmail = payload.data.customer.email;
        if (!customerEmail) return;

        const supabase = await createClient();

        const { error } = await supabase
            .from("users")
            .update({
                promo_expires_at: null,
            })
            .eq("email", customerEmail);

        if (error) {
            console.error("Failed to remove user Pro status:", error);
        } else {
            console.log(`User ${customerEmail} Pro status removed`);
        }
    },

    // 구독 갱신 시 만료일 연장
    onSubscriptionUpdated: async (payload) => {
        console.log("Subscription updated:", payload);

        // 활성 상태인 경우에만 만료일 연장
        if (payload.data.status === "active") {
            const customerEmail = payload.data.customer.email;
            if (!customerEmail) return;

            const supabase = await createClient();

            // 구독 만료일 연장 (1달 후)
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1);

            const { error } = await supabase
                .from("users")
                .update({
                    promo_expires_at: expiresAt.toISOString(),
                })
                .eq("email", customerEmail);

            if (error) {
                console.error("Failed to extend user Pro status:", error);
            }
        }
    },
});
