export type Locale = "ko" | "en";

export const translations = {
  ko: {
    // Common
    common: {
      loading: "로딩 중...",
      save: "저장",
      cancel: "취소",
      delete: "삭제",
      edit: "수정",
      back: "뒤로",
      next: "다음",
      confirm: "확인",
      close: "닫기",
      settings: "설정",
      history: "기록",
      dashboard: "대시보드",
    },

    // Landing Page
    landing: {
      nav: {
        features: "Features",
        howItWorks: "How it works",
      },
      hero: {
        badge: "Record once, document automatically",
        title: "음성을",
        titleHighlight: "완벽한 문서로",
        description: "회의, 강의, 인터뷰를 녹음하세요. AI가 자동으로 전사하고, 요약하고, Notion에 정리해드립니다.",
      },
      features: {
        title: "아이디어를 담는 모든 것",
        description: "더 이상 노트 걱정 마세요. 대화에 집중하고, 나머지는 Flownote에게 맡기세요.",
        recording: {
          title: "고품질 녹음",
          description: "자동 저장과 클라우드 백업이 되는 웹 녹음. 최대 120분까지.",
        },
        transcription: {
          title: "즉시 전사",
          description: "Whisper API로 다국어 99% 정확도를 자랑합니다.",
        },
        summarization: {
          title: "AI 요약",
          description: "GPT-4로 구조화된 회의록, 액션 아이템, 요약을 즉시 생성합니다.",
        },
      },
      howItWorks: {
        title: "어떻게 작동하나요",
        description: "녹음에서 정리된 문서까지, 몇 시간이 아닌 몇 분이면 됩니다.",
        steps: {
          record: {
            title: "녹음",
            description: "클릭 한 번으로 회의, 강의, 인터뷰를 녹음하세요.",
          },
          transcribe: {
            title: "전사",
            description: "AI가 자동으로 정확한 텍스트로 변환합니다.",
          },
          organize: {
            title: "정리",
            description: "GPT-4가 콘텐츠를 아름다운 문서로 구조화합니다.",
          },
          share: {
            title: "공유",
            description: "Notion에 자동 저장되고 Slack으로 공유됩니다.",
          },
        },
      },
      integrations: {
        title: "완벽한 연동",
        description: "매일 사용하는 도구와 연결하세요.",
        notion: "자동 문서 저장",
        slack: "즉시 알림",
        google: "안전한 로그인",
      },
      cta: {
        title: "오늘부터 아이디어를 기록하세요",
        description: "자동화된 문서화로 매주 몇 시간을 절약하는 수천 명의 전문가와 함께하세요.",
      },
      footer: {
        rights: "©2025 FLOWNOTE · All rights reserved.",
        ceo: "FLOWNOTE | CEO: Youngmin Park",
        privacy: "Privacy",
        terms: "Terms",
      },
    },

    // Dashboard
    dashboard: {
      newRecording: "새 녹음",
      selectFormat: "포맷을 선택하고 녹음을 시작하세요",
      processing: "변환 중...",
      processingDescription: "음성을 텍스트로 변환하고 AI 요약을 생성하고 있습니다. 잠시만 기다려주세요.",
      startRecording: "버튼을 눌러 녹음을 시작하세요",
      maxDuration: "(최대 120분)",
      wakeLockActive: "녹음 중 (화면이 켜진 상태로 유지됩니다)",
      wakeLockInactive: "화면 유지 기능을 사용할 수 없습니다",
    },

    // History
    history: {
      title: "녹음 기록",
      filters: {
        all: "전체",
        processing: "처리 중",
        completed: "완료",
        failed: "실패",
      },
      status: {
        processing: "처리 중...",
        completed: "처리 완료",
        failed: "처리 실패",
        pending: "대기 중",
      },
      noRecordings: "녹음이 없습니다",
      noRecordingsDesc: "첫 번째 녹음을 시작해보세요.",
      startRecording: "녹음 시작",
      errorSteps: {
        transcription: "음성 전사 단계",
        formatting: "AI 포맷팅 단계",
        notion: "Notion 연동 단계",
        slack: "Slack 알림 단계",
        upload: "파일 업로드 단계",
        unknown: "알 수 없는 단계",
      },
      deleteConfirm: "정말 삭제하시겠습니까?",
      deleteFailed: "삭제에 실패했습니다.",
      titleRequired: "제목을 입력해주세요.",
      titleUpdateFailed: "제목 수정에 실패했습니다.",
    },

    // Settings
    settings: {
      title: "설정",
      account: {
        title: "계정 정보",
        email: "이메일",
        noEmail: "이메일 정보 없음",
        usage: "사용량 제한",
        used: "Used",
      },
      integrations: {
        title: "연동",
        notion: {
          title: "Notion",
          connected: "데이터베이스에 자동 저장 활성화됨",
          selectDb: "자동 저장을 위해 데이터베이스를 선택하세요",
          notConnected: "노트를 자동으로 저장하려면 연결하세요",
          configure: "설정",
          connect: "Notion 연결",
        },
        slack: {
          title: "Slack",
          description: "요약이 준비되면 알림 받기",
          reconnect: "재연결",
        },
      },
      data: {
        title: "데이터 관리",
        autoDelete: "자동 삭제",
        autoDeleteDesc: "30일이 지난 녹음을 자동으로 삭제합니다",
        danger: "위험 구역",
        dangerDesc: "이 작업은 되돌릴 수 없습니다. 모든 데이터가 영구적으로 삭제됩니다.",
        deleteAll: "모든 데이터 삭제",
        deleteConfirm: "정말 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
        deleteDoubleConfirm: "주의: 모든 녹음, 커스텀 포맷, 연결된 통합이 삭제됩니다. 계속하시겠습니까?",
        deleteSuccess: "모든 데이터가 삭제되었습니다.",
        deleteFailed: "데이터 삭제에 실패했습니다.",
      },
      signOut: "로그아웃",
      language: {
        title: "언어 설정",
        description: "서비스 표시 언어를 선택하세요",
        korean: "한국어",
        english: "English",
      },
      notionModal: {
        title: "Notion 데이터베이스 설정",
        selectTab: "기존 선택",
        createTab: "새로 만들기",
        noDatabases: "데이터베이스가 없습니다.",
        createNew: "새 데이터베이스 만들기 →",
        dbName: "데이터베이스 이름",
        selectPage: "상위 페이지 선택",
        noPages: "페이지가 없습니다. Notion에서 먼저 페이지를 만들어주세요.",
        create: "데이터베이스 만들기",
        dbSet: "Notion 데이터베이스가 설정되었습니다.",
        dbSetFailed: "데이터베이스 설정에 실패했습니다.",
        createFailed: "데이터베이스 생성에 실패했습니다.",
        fetchFailed: "Notion 데이터를 불러오는데 실패했습니다.",
        selectPageFirst: "페이지를 선택해주세요.",
      },
    },

    // Onboarding
    onboarding: {
      step1: {
        title: "Flownote에 오신 것을 환영합니다",
        description: "몇 초만에 설정을 완료하세요. 워크플로우를 자동화하기 위해 즐겨 쓰는 도구를 연결합니다.",
        getStarted: "시작하기",
      },
      step2: {
        title: "서비스 연결",
        description: "자동화를 위해 Notion과 Slack을 연결하세요",
        notion: {
          title: "Notion",
          description: "요약을 데이터베이스에 자동 저장",
          connected: "연결됨",
          configInSettings: "설정에서 구성 가능",
          connect: "Notion 연결",
        },
        slack: {
          title: "Slack",
          description: "준비되면 알림 받기",
          connected: "연결됨",
          configInSettings: "설정에서 구성 가능",
          connect: "Slack 연결",
        },
        back: "뒤로",
        complete: "설정 완료",
      },
    },

    // Auth
    auth: {
      signInWithGoogle: "Google로 시작하기",
      getStarted: "무료로 시작하기",
    },

    // Errors
    errors: {
      uploadFailed: "녹음 업로드에 실패했습니다. 다시 시도해주세요.",
      micPermission: "마이크 접근 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.",
      micNotFound: "녹음을 시작할 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.",
      recordingError: "녹음 중 오류가 발생했습니다.",
    },
  },

  en: {
    // Common
    common: {
      loading: "Loading...",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      back: "Back",
      next: "Next",
      confirm: "Confirm",
      close: "Close",
      settings: "Settings",
      history: "History",
      dashboard: "Dashboard",
    },

    // Landing Page
    landing: {
      nav: {
        features: "Features",
        howItWorks: "How it works",
      },
      hero: {
        badge: "Record once, document automatically",
        title: "Turn your voice into",
        titleHighlight: "perfect documents",
        description: "Record meetings, lectures, and interviews. Let AI automatically transcribe, summarize, and organize them into your Notion workspace.",
      },
      features: {
        title: "Everything you need to capture ideas",
        description: "Stop worrying about taking notes. Focus on the conversation and let Flownote handle the rest.",
        recording: {
          title: "Crystal Clear Recording",
          description: "High-quality web recording with auto-save and cloud backup. Record up to 120 minutes.",
        },
        transcription: {
          title: "Instant Transcription",
          description: "Powered by Whisper API for 99% accuracy in multiple languages.",
        },
        summarization: {
          title: "AI Summarization",
          description: "Get structured meeting notes, action items, and summaries instantly with GPT-4.",
        },
      },
      howItWorks: {
        title: "How it works",
        description: "From recording to organized document in minutes, not hours.",
        steps: {
          record: {
            title: "Record",
            description: "Click and start recording your meeting, lecture, or interview.",
          },
          transcribe: {
            title: "Transcribe",
            description: "AI automatically converts your audio to accurate text.",
          },
          organize: {
            title: "Organize",
            description: "GPT-4 structures your content into beautiful documents.",
          },
          share: {
            title: "Share",
            description: "Automatically saved to Notion and shared via Slack.",
          },
        },
      },
      integrations: {
        title: "Seamlessly integrated",
        description: "Connect with the tools you already use every day.",
        notion: "Auto-save documents",
        slack: "Instant notifications",
        google: "Secure login",
      },
      cta: {
        title: "Start capturing your ideas today",
        description: "Join thousands of professionals who save hours every week with automated documentation.",
      },
      footer: {
        rights: "©2025 FLOWNOTE · All rights reserved.",
        ceo: "FLOWNOTE | CEO: Youngmin Park",
        privacy: "Privacy",
        terms: "Terms",
      },
    },

    // Dashboard
    dashboard: {
      newRecording: "New Recording",
      selectFormat: "Select a format and start recording",
      processing: "Processing...",
      processingDescription: "Transcribing and generating AI summary. This may take a moment.",
      startRecording: "Press the button to start recording",
      maxDuration: "(up to 120 minutes)",
      wakeLockActive: "Recording (screen will stay on)",
      wakeLockInactive: "Screen wake lock unavailable",
    },

    // History
    history: {
      title: "Recording History",
      filters: {
        all: "All",
        processing: "Processing",
        completed: "Completed",
        failed: "Failed",
      },
      status: {
        processing: "Processing...",
        completed: "Completed",
        failed: "Failed",
        pending: "Pending",
      },
      noRecordings: "No recordings found",
      noRecordingsDesc: "Start your first recording to see it here.",
      startRecording: "Start Recording",
      errorSteps: {
        transcription: "Transcription step",
        formatting: "AI formatting step",
        notion: "Notion integration step",
        slack: "Slack notification step",
        upload: "File upload step",
        unknown: "Unknown step",
      },
      deleteConfirm: "Are you sure you want to delete this?",
      deleteFailed: "Failed to delete.",
      titleRequired: "Please enter a title.",
      titleUpdateFailed: "Failed to update title.",
    },

    // Settings
    settings: {
      title: "Settings",
      account: {
        title: "Account Information",
        email: "Email",
        noEmail: "No email info",
        usage: "Usage Limit",
        used: "Used",
      },
      integrations: {
        title: "Integrations",
        notion: {
          title: "Notion",
          connected: "Auto-save to database enabled",
          selectDb: "Select a database to enable auto-save",
          notConnected: "Connect to save notes automatically",
          configure: "Configure",
          connect: "Connect Notion",
        },
        slack: {
          title: "Slack",
          description: "Get notified when summaries are ready",
          reconnect: "Reconnect",
        },
      },
      data: {
        title: "Data Management",
        autoDelete: "Auto-deletion",
        autoDeleteDesc: "Automatically delete recordings older than 30 days",
        danger: "Danger Zone",
        dangerDesc: "This action cannot be undone. All data will be permanently deleted.",
        deleteAll: "Delete All Data",
        deleteConfirm: "Are you sure you want to delete all data? This cannot be undone.",
        deleteDoubleConfirm: "Warning: All recordings, custom formats, and connected integrations will be deleted. Continue?",
        deleteSuccess: "All data has been deleted.",
        deleteFailed: "Failed to delete data.",
      },
      signOut: "Sign Out",
      language: {
        title: "Language Settings",
        description: "Choose your preferred display language",
        korean: "한국어",
        english: "English",
      },
      notionModal: {
        title: "Configure Notion Database",
        selectTab: "Select Existing",
        createTab: "Create New",
        noDatabases: "No databases found.",
        createNew: "Create a new database →",
        dbName: "Database Name",
        selectPage: "Select Parent Page",
        noPages: "No pages found. Please create a page in Notion first.",
        create: "Create Database",
        dbSet: "Notion database has been configured.",
        dbSetFailed: "Failed to set database.",
        createFailed: "Failed to create database.",
        fetchFailed: "Failed to fetch Notion data.",
        selectPageFirst: "Please select a page.",
      },
    },

    // Onboarding
    onboarding: {
      step1: {
        title: "Welcome to Flownote",
        description: "Let's get you set up in just a few seconds. We'll connect your favorite tools to automate your workflow.",
        getStarted: "Get Started",
      },
      step2: {
        title: "Connect Services",
        description: "Link Notion and Slack to enable automation",
        notion: {
          title: "Notion",
          description: "Auto-save summaries to your database",
          connected: "Connected",
          configInSettings: "Configuration available in Settings",
          connect: "Connect Notion",
        },
        slack: {
          title: "Slack",
          description: "Receive notifications when ready",
          connected: "Connected",
          configInSettings: "Configuration available in Settings",
          connect: "Connect Slack",
        },
        back: "Back",
        complete: "Complete Setup",
      },
    },

    // Auth
    auth: {
      signInWithGoogle: "Continue with Google",
      getStarted: "Get Started Free",
    },

    // Errors
    errors: {
      uploadFailed: "Failed to upload recording. Please try again.",
      micPermission: "Microphone permission is required. Please allow access in browser settings.",
      micNotFound: "Cannot start recording. Please check if a microphone is connected.",
      recordingError: "An error occurred during recording.",
    },
  },
} as const;

export type TranslationKeys = typeof translations.ko;
