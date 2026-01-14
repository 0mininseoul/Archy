"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface PlanManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PlanManagementModal({ isOpen, onClose }: PlanManagementModalProps) {
    const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">("pro");

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

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
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 p-6 min-h-[500px] max-h-[90vh] overflow-y-auto"
                    >
                        {/* Handle Bar */}
                        <div className="flex justify-center mb-6">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                        </div>

                        {/* Close Button (Hidden but accessible via backdrop or handler, adding explicit close for usability) */}
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-900">막힘없는 티로를 바로 만나보세요</h2>
                            <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 mb-8">
                            지금 업그레이드하고 모든 기능을 마음껏 이용해보세요.
                        </p>

                        {/* Feature List */}
                        <div className="flex items-start justify-between mb-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm text-slate-700">노트당 60분 제한 해제</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm text-slate-700">고품질 한페이지 문서</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm text-slate-700">노트 기반 무제한 AI 채팅</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-sm text-slate-700">원하는 양식으로, 나만의 템플릿</span>
                                </div>
                            </div>
                            {/* Decorative Image */}
                            <div className="w-24 h-24 relative flex-shrink-0 opacity-80">
                                {/* Using a placeholder or existing asset if available, referencing the design style */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-4xl">♾️</span>
                                </div>
                            </div>
                        </div>

                        {/* Plan Selection */}
                        <div className="space-y-3 mb-8">
                            {/* Max Plan (Placeholder) */}
                            <div className="border border-slate-200 rounded-xl p-4 opacity-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full border border-slate-300" />
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">Max</p>
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 pl-8">
                                    ₩44,000/월에 매달 무제한 사용 및 모든 Pro 플랜 기능 이용 가능
                                </p>
                            </div>

                            {/* Pro Plan (Selected) */}
                            <div
                                className={`border-2 rounded-xl p-4 transition-colors ${selectedPlan === 'pro' ? 'border-[#CCF913] bg-[#FAFAE5]' : 'border-slate-200'}`}
                                onClick={() => setSelectedPlan('pro')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative flex items-center justify-center">
                                        {selectedPlan === 'pro' ? (
                                            <div className="w-5 h-5 rounded-full bg-[#CCF913] flex items-center justify-center">
                                                <svg className="w-3 h-3 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border border-slate-300" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">Pro</p>
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-slate-600 pl-8">
                                    <span className="line-through text-slate-400 mr-2">$9.99</span>
                                    <span className="font-bold text-slate-900">$3.99</span>
                                    /월에 매달 무제한 사용 및 모든 기능 이용 가능
                                </p>
                            </div>

                            {/* Lite Plan (Placeholder) */}
                            <div className="border border-slate-200 rounded-xl p-4 opacity-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full border border-slate-300" />
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">Lite</p>
                                    </div>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 pl-8">
                                    ₩9,900/월에 매달 300분 이용 가능
                                </p>
                            </div>
                        </div>

                        {/* Purchase Button */}
                        <button className="w-full bg-gradient-to-r from-[#EEDD44] to-[#44BBEE] text-white font-bold py-4 rounded-xl text-md shadow-sm hover:shadow-md transition-shadow">
                            지금 구매
                        </button>

                        <div className="flex justify-center gap-6 mt-4 text-xs text-slate-500">
                            <button>약관</button>
                            <button>개인 정보 보호</button>
                            <button>구매 복원</button>
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
