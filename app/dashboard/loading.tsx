import Image from "next/image";

export default function Loading() {
    return (
        <div className="flex items-center justify-center h-full w-full bg-[#0f172a] animate-fade-in">
            <div className="relative w-24 h-24 animate-pulse">
                <Image
                    src="/icons/archy logo.png"
                    alt="Archy Logo"
                    fill
                    className="object-contain"
                    priority
                />
            </div>
        </div>
    );
}
