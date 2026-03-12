import { LandingClient } from "@/components/landing/LandingClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archy - AI 음성 자동 문서화 서비스 | 회의록, 강의록, 인터뷰 자동 정리",
  description:
    "Archy는 회의, 강의, 인터뷰를 녹음하면 AI가 자동으로 전사하고 문서로 정리하는 서비스입니다. 매월 350분 무료, Notion·Google Docs 자동 저장, Slack 알림 지원. 녹음 파일은 저장하지 않아 프라이버시를 보호합니다.",
  keywords: [
    "AI 회의록",
    "음성 전사",
    "자동 문서화",
    "AI 노트 테이커",
    "회의록 자동 작성",
    "강의 녹음 정리",
    "인터뷰 전사",
    "Notion 연동",
    "Google Docs 연동",
    "음성 인식",
    "AI meeting notes",
    "voice transcription",
    "automated documentation",
  ],
  alternates: {
    canonical: "https://www.archynotes.com",
  },
};

// JSON-LD structured data for AI citability
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Archy",
  url: "https://www.archynotes.com",
  logo: "https://www.archynotes.com/icons/icon-512x512.png",
  description:
    "Archy is an AI-powered voice documentation service that automatically converts audio recordings into structured, formatted documents.",
  foundingDate: "2025",
  contactPoint: {
    "@type": "ContactPoint",
    email: "contact@ascentum.co.kr",
    contactType: "customer support",
  },
  knowsAbout: [
    "AI transcription",
    "Voice documentation",
    "Meeting notes automation",
    "Speech-to-text",
    "Document formatting",
  ],
  sameAs: [
    "https://www.linkedin.com/in/youngmin-park-8b7384298/",
  ],
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Archy",
  url: "https://www.archynotes.com",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web (PWA)",
  description:
    "Archy is an automated voice documentation service. Record meetings, lectures, or interviews and get AI-formatted documents saved to Notion and Google Docs. 350 free minutes per month, multilingual support for Korean and English, with Slack notifications.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
    description: "Free tier: 350 minutes per month. Earn 350 bonus minutes per referral.",
  },
  featureList: [
    "AI-powered audio transcription using Groq Whisper Large V3",
    "Automatic document formatting and summarization",
    "Notion integration for automatic page creation",
    "Google Docs integration for document storage",
    "Slack notifications when documents are ready",
    "Web push notifications",
    "Custom format templates",
    "Korean and English language support",
    "350 free minutes per month",
    "Privacy-first: audio is never stored",
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Archy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Archy is an AI-powered voice documentation service that automatically converts audio recordings into structured, formatted documents. Record meetings, lectures, or interviews, and Archy transcribes the audio using Groq Whisper AI, then formats the transcript into professional documents with summaries and action items. Documents are automatically saved to Notion, Google Docs, and shared via Slack.",
      },
    },
    {
      "@type": "Question",
      name: "Is Archy free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, Archy offers 350 free minutes of audio transcription per month. You can earn an additional 350 bonus minutes for each friend you refer — both you and your friend receive the bonus. No credit card is required to get started.",
      },
    },
    {
      "@type": "Question",
      name: "What languages does Archy support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Archy uses Groq Whisper Large V3 AI to accurately transcribe multilingual audio, including Korean and English. The interface is also fully available in both Korean and English.",
      },
    },
    {
      "@type": "Question",
      name: "How does Archy handle audio recordings and privacy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Archy prioritizes your privacy. Recorded audio is immediately deleted after AI transcription and is never stored on our servers. Only text content — transcripts and formatted documents — is securely saved in the database.",
      },
    },
    {
      "@type": "Question",
      name: "How do I connect Notion, Google Docs, and Slack with Archy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can connect Notion, Google Docs, and Slack from the Settings page with just a few clicks. Integration is handled securely through OAuth authentication. Once connected, your formatted documents are automatically saved to your linked services whenever a recording is completed.",
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd),
        }}
      />
      <LandingClient />
    </>
  );
}
