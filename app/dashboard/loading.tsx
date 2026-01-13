import Image from "next/image";

export default function Loading() {
    return (
        <div className="fixed inset-0 z-50 h-[100dvh] w-full bg-[#0f172a] animate-fade-in">
            <Image
                src="/splash-screen.png"
                alt="Archy Splash Screen"
                fill
                className="object-cover"
                priority
            />
        </div>
    );
}
