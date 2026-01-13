import Image from "next/image";

export default function Loading() {
    return (
        <div className="relative h-full w-full bg-[#0f172a] animate-fade-in">
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
