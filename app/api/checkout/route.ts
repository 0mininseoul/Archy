import { Checkout } from "@polar-sh/nextjs";

export const GET = Checkout({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    successUrl: process.env.POLAR_SUCCESS_URL!,
    server: "sandbox", // 테스트 중에는 sandbox 사용, 프로덕션에서는 "production"으로 변경
    theme: "dark",
});
