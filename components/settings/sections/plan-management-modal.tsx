"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useDragControls, PanInfo } from "framer-motion";
import { X, Check, Minus } from "lucide-react";
import Image from "next/image";

interface PlanManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PlanManagementModal({ isOpen, onClose }: PlanManagementModalProps) {
    const dragControls = useDragControls();

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            // Check if on iOS to handle safaris bottom bar
            const viewport = window.visualViewport;
            if (viewport) {
                document.body.style.height = `${viewport.height}px`;
            }
        } else {
            document.body.style.overflow = "unset";
            document.body.style.height = 'auto';
        }
        return () => {
            document.body.style.overflow = "unset";
            document.body.style.height = 'auto';
        };
    }, [isOpen]);

    const onDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > 100) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black z-40"
                    />

                    {/* Modal Bottom Sheet */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.2 }}
                        onDragEnd={onDragEnd}
                        className="fixed bottom-0 left-0 right-0 mx-auto md:max-w-[430px] bg-white rounded-t-[2rem] z-50 flex flex-col max-h-[80dvh] shadow-2xl"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    >
                        {/* Header / Drag Handle Area */}
                        <div
                            className="pt-5 pb-2 px-6 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            {/* Drag Indicator */}
                            <div className="flex justify-center mb-6">
                                <div className="w-12 h-1.5 bg-slate-200 rounded-full opacity-50" />
                            </div>

                            {/* Close Button (Absolute positioned to top-right of modal) */}
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* Title Section */}
                            <div className="text-center mb-4">
                                <div className="flex justify-center mb-4">
                                    <div className="relative w-12 h-12 shadow-sm rounded-xl overflow-hidden">
                                        <Image
                                            src="/icons/archy logo.png"
                                            fill
                                            alt="Archy Logo"
                                            className="object-cover"
                                        />
                                    </div>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 leading-snug mb-2">
                                    아키를 무제한으로 사용하세요
                                </h2>
                                <p className="text-sm text-slate-500 whitespace-pre-wrap">
                                    지금 업그레이드하고 모든 기능을 마음껏 이용해보세요.
                                </p>
                            </div>
                        </div>

                        {/* Content Scroll Area */}
                        <div className="flex-1 overflow-y-auto px-6 pb-4">
                            {/* Feature Comparison Table */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-1 mb-2">
                                {/* Header Row */}
                                <div className="grid grid-cols-[1.5fr_1fr_1fr] py-3 border-b border-slate-100">
                                    <div className="pl-4 text-xs font-medium text-slate-400">기능</div>
                                    <div className="text-center text-xs font-bold text-slate-500">Free</div>
                                    <div className="text-center text-xs font-bold text-indigo-600">Pro</div>
                                </div>

                                {/* Rows */}
                                <div className="divide-y divide-slate-50">
                                    {/* Monthly Usage */}
                                    <div className="grid grid-cols-[1.5fr_1fr_1fr] py-4 items-center">
                                        <div className="pl-4 text-sm font-medium text-slate-700">월간 사용량</div>
                                        <div className="text-center text-sm text-slate-500">350분</div>
                                        <div className="text-center text-sm font-bold text-indigo-600">무제한</div>
                                    </div>

                                    {/* Recording Time Limit */}
                                    <div className="grid grid-cols-[1.5fr_1fr_1fr] py-4 items-center">
                                        <div className="pl-4 text-sm font-medium text-slate-700">1회 녹음 시간</div>
                                        <div className="text-center text-sm text-slate-500">120분</div>
                                        <div className="text-center text-sm font-bold text-indigo-600">무제한</div>
                                    </div>

                                    {/* AI Chat */}
                                    <div className="grid grid-cols-[1.5fr_1fr_1fr] py-4 items-center">
                                        <div className="pl-4 text-sm font-medium text-slate-700">AI 채팅</div>
                                        <div className="flex justify-center text-slate-300">
                                            <Minus className="w-4 h-4" />
                                        </div>
                                        <div className="flex justify-center text-indigo-600">
                                            <Check className="w-5 h-5 bg-indigo-100 rounded-full p-0.5" />
                                        </div>
                                    </div>

                                    {/* Templates */}
                                    <div className="grid grid-cols-[1.5fr_1fr_1fr] py-4 items-center">
                                        <div className="pl-4 text-sm font-medium text-slate-700">커스텀 템플릿</div>
                                        <div className="text-center text-sm text-slate-500">1개</div>
                                        <div className="text-center text-sm font-bold text-indigo-600">무제한</div>
                                    </div>

                                    {/* High Quality Features */}
                                    <div className="grid grid-cols-[1.5fr_1fr_1fr] py-4 items-center">
                                        <div className="pl-4 text-sm font-medium text-slate-700">고품질 문서</div>
                                        <div className="flex justify-center text-slate-400">
                                            <Check className="w-4 h-4" />
                                        </div>
                                        <div className="flex justify-center text-indigo-600">
                                            <Check className="w-5 h-5 bg-indigo-100 rounded-full p-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Button Area */}
                        <div className="px-6 pt-2 pb-8 bg-white border-t border-slate-50 mt-auto rounded-b-[2rem]">
                            <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-full text-md shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all transform active:scale-[0.98]">
                                $3.99에 업그레이드
                            </button>
                            <p className="text-center text-[10px] text-slate-400 mt-2.5 leading-tight">
                                매월 자동 갱신됩니다. 언제든 취소할 수 있습니다.
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
