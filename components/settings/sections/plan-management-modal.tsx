"use client";

import { useEffect, useState } from "react";
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
                        className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 p-6 max-h-[85vh] overflow-y-auto pb-10"
                    >
                        {/* Handle Bar */}
                        <div className="flex justify-center mb-6">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                        </div>

                        {/* Header with Close Button */}
                        <div className="flex justify-between items-start mb-6">
                            <div className="pr-8">
                                <h2 className="text-xl font-bold text-slate-900 leading-snug">
                                    아키를 무제한으로 사용하세요
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    지금 업그레이드하고 모든 기능을 마음껏 이용해보세요.
                                </p>
                            </div>
                            <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Feature List (Vertical) */}
                        <div className="space-y-4 mb-8">
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm text-slate-700">노트당 60분 제한 해제</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm text-slate-700">고품질 한페이지 문서</span>
                                <div className="ml-auto">
                                    <span className="text-2xl text-slate-400">∞</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm text-slate-700">노트 기반 무제한 AI 채팅</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <svg className="w-5 h-5 text-slate-900 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm text-slate-700">원하는 양식으로, 나만의 템플릿</span>
                            </div>
                        </div>

                        {/* Plan Selection Cards */}
                        <div className="space-y-3 mb-8">
                            {/* Free Plan */}
                            <div
                                className={`border border-slate-200 rounded-xl p-4 flex items-center justify-between opacity-50`}
                                onClick={() => setSelectedPlan('free')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full border border-slate-300" />
                                    <span className="font-bold text-slate-900 text-sm">Free</span>
                                </div>
                                <span className="text-sm text-slate-500">$0 / 월</span>
                            </div>

                            {/* Pro Plan (Selected) */}
                            <div
                                className={`border-2 rounded-xl p-4 flex items-center justify-between transition-colors cursor-pointer ${selectedPlan === 'pro' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                                onClick={() => setSelectedPlan('pro')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative flex items-center justify-center">
                                        {selectedPlan === 'pro' ? (
                                            <div className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center">
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border border-slate-300" />
                                        )}
                                    </div>
                                    <span className="font-bold text-slate-900 text-sm">Pro</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">$3.99 / 월</span>
                            </div>
                        </div>

                        {/* Purchase Layout */}
                        <div className="mt-auto">
                            <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl text-md shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all">
                                $3.99에 업그레이드
                            </button>
                            <p className="text-center text-xs text-slate-400 mt-3">
                                매월 자동 갱신됩니다. 언제든 취소할 수 있습니다.
                            </p>
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
