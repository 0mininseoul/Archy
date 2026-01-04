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

    // Navigation
    nav: {
      record: "녹음",
      history: "기록",
      settings: "설정",
    },

    // Landing Page
    landing: {
      nav: {
        features: "Features",
        howItWorks: "How it works",
      },
      hero: {
        badge: "Record once, document automatically",
        title: "녹음 한 번으로",
        titleHighlight: "완성되는 자동 문서",
        description: "회의, 강의, 인터뷰, 뭐든 녹음하세요.\nAI가 자동으로 문서를 완성해드립니다.",
      },
      features: {
        title: "가장 가성비 있는 AI 노트 테이커",
        description: "더 이상 기록은 걱정하지 마세요.\n대화에 집중하고, 나머지는 Flownote에게 맡기세요.",
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
          description: "구조화된 회의록, 액션 아이템, 요약을 즉시 생성합니다.",
        },
      },
      howItWorks: {
        title: "원클릭 녹음으로 끝내세요",
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
            description: "AI가 콘텐츠를 아름다운 문서로 구조화합니다.",
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
        title: "녹음 버튼 하나만 누르면 됩니다.",
        description: "자동화된 문서화로 매주 몇 시간을 절약할 수 있어요!",
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
      notionNotConnected: "Notion이 연결되지 않았습니다. 녹음 내용이 Notion에 저장되지 않습니다.",
      slackNotConnected: "Slack이 연결되지 않았습니다. 완료 알림이 발송되지 않습니다.",
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
      processingSteps: {
        transcription: "전사 중...",
        formatting: "요약 중...",
        saving: "저장 중...",
      },
      processingNotice: "이 페이지에서 나가셔도 자동으로 처리 후 슬랙으로 알려드립니다.",
      noRecordings: "녹음이 없습니다",
      noRecordingsDesc: "첫 번째 녹음을 시작해보세요.",
      startRecording: "녹음 시작",
      errorSteps: {
        transcription: "음성 전사 단계",
        formatting: "AI 포맷팅 단계",
        notion: "Notion 연동 단계",
        google: "Google Docs 단계",
        slack: "Slack 알림 단계",
        upload: "파일 업로드 단계",
        unknown: "알 수 없는 단계",
      },
      deleteConfirm: "정말 삭제하시겠습니까?",
      deleteFailed: "삭제에 실패했습니다.",
      titleRequired: "제목을 입력해주세요.",
      titleUpdateFailed: "제목 수정에 실패했습니다.",
      viewTranscript: "전사본 보기",
      transcriptPreview: "전사본 미리보기",
      audioNotStored: "오디오 파일은 저장되지 않습니다",
      viewAll: "전체 보기",
      processingInfo: "음성을 텍스트로 변환 중입니다. 오디오 파일은 저장되지 않습니다.",
    },

    // Settings
    settings: {
      title: "설정",
      account: {
        title: "계정 정보",
        email: "이메일",
        noEmail: "이메일 정보 없음",
        usage: "사용량 제한",
        used: "사용됨",
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
        google: {
          title: "Google Docs",
          description: "구글 드라이브에 자동으로 문서 저장",
          connected: "구글 드라이브에 자동 저장 활성화됨",
          notConnected: "노트를 구글 문서로 저장하려면 연결하세요",
          connect: "Google 연결",
          disconnect: "해지",
          selectFolder: "저장 폴더를 선택하세요",
          rootFolder: "내 드라이브 (루트)",
        },
        slack: {
          title: "Slack",
          description: "요약이 준비되면 알림 받기",
          reconnect: "재연결",
        },
      },
      formats: {
        title: "요약 포맷",
        description: "녹음 요약 시 사용할 기본 포맷을 설정하세요",
        auto: "스마트 포맷",
        autoDesc: "AI가 미팅/강의를 자동 판단하여 적절한 형식으로 요약",
        default: "기본 포맷",
        defaultDesc: "회의록 형식 (참석자, 주요 안건, 결정 사항, 액션 아이템)",
        custom: "커스텀 포맷",
        customDesc: "최대 3개의 커스텀 포맷을 만들 수 있습니다",
        addNew: "새 포맷 추가",
        formatName: "포맷 이름",
        formatPrompt: "프롬프트",
        promptPlaceholder: "예: 핵심 내용을 3줄로 요약하고, 다음에 해야 할 일 목록을 작성해줘.",
        setAsDefault: "기본값으로 설정",
        isDefault: "기본값",
        maxFormats: "최대 3개까지 만들 수 있습니다",
        saveSuccess: "포맷이 저장되었습니다.",
        saveFailed: "포맷 저장에 실패했습니다.",
        deleteSuccess: "포맷이 삭제되었습니다.",
        deleteFailed: "포맷 삭제에 실패했습니다.",
        deleteConfirm: "이 포맷을 삭제하시겠습니까?",
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
        description: "녹음 한 번으로 완성되는 자동 문서화 서비스입니다.",
        getStarted: "시작하기",
      },
      step2: {
        title: "이런 기능들이 있어요",
        description: "녹음 후 자동으로 문서가 완성됩니다",
        autoFormat: {
          title: "스마트 포맷 감지",
          description: "AI가 녹음 내용을 분석해 미팅인지 강의인지 자동으로 판단하고, 각 형식에 맞게 요약합니다.",
        },
        integrations: {
          title: "서비스 연동",
          description: "Notion, Google Docs, Slack과 연동하여 자동 저장 및 알림을 받을 수 있습니다.",
        },
        customFormat: {
          title: "나만의 포맷",
          description: "원하는 요약 스타일을 직접 정의할 수도 있습니다.",
        },
        settingsTip: "연동 및 포맷 설정은 설정 메뉴에서 언제든 변경할 수 있어요.",
        back: "뒤로",
        skip: "건너뛰기",
        next: "다음",
      },
      step3: {
        title: "요약 포맷 설정",
        description: "녹음 요약 시 사용할 포맷을 설정하세요 (나중에 변경 가능)",
        useDefault: "기본 포맷 사용",
        defaultDesc: "회의록 형식으로 정리됩니다",
        createCustom: "커스텀 포맷 만들기",
        customDesc: "나만의 요약 스타일을 정의하세요",
        formatName: "포맷 이름",
        formatPrompt: "프롬프트",
        promptPlaceholder: "예: 핵심 내용을 3줄로 요약하고, 다음에 해야 할 일 목록을 작성해줘.",
        back: "뒤로",
        skip: "건너뛰기",
        complete: "설정 완료",
      },
    },

    // Auth
    auth: {
      signInWithGoogle: "시작하기",
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

    // Navigation
    nav: {
      record: "Record",
      history: "History",
      settings: "Settings",
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
          description: "Get structured meeting notes, action items, and summaries instantly.",
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
            description: "AI structures your content into beautiful documents.",
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
      notionNotConnected: "Notion is not connected. Your recording will not be saved to Notion.",
      slackNotConnected: "Slack is not connected. You will not receive completion notifications.",
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
      processingSteps: {
        transcription: "Transcribing...",
        formatting: "Summarizing...",
        saving: "Saving...",
      },
      processingNotice: "You can leave this page. We'll notify you via Slack when it's done.",
      noRecordings: "No recordings found",
      noRecordingsDesc: "Start your first recording to see it here.",
      startRecording: "Start Recording",
      errorSteps: {
        transcription: "Transcription step",
        formatting: "AI formatting step",
        notion: "Notion integration step",
        google: "Google Docs step",
        slack: "Slack notification step",
        upload: "File upload step",
        unknown: "Unknown step",
      },
      deleteConfirm: "Are you sure you want to delete this?",
      deleteFailed: "Failed to delete.",
      titleRequired: "Please enter a title.",
      titleUpdateFailed: "Failed to update title.",
      viewTranscript: "View Transcript",
      transcriptPreview: "Transcript Preview",
      audioNotStored: "Audio files are not stored",
      viewAll: "View All",
      processingInfo: "Converting audio to text. Audio files are not stored.",
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
        google: {
          title: "Google Docs",
          description: "Auto-save documents to Google Drive",
          connected: "Auto-save to Google Drive enabled",
          notConnected: "Connect to save notes as Google Docs",
          connect: "Connect Google",
          disconnect: "Disconnect",
          selectFolder: "Select a folder to save",
          rootFolder: "My Drive (root)",
        },
        slack: {
          title: "Slack",
          description: "Get notified when summaries are ready",
          reconnect: "Reconnect",
        },
      },
      formats: {
        title: "Summary Format",
        description: "Set the default format for recording summaries",
        auto: "Smart Format",
        autoDesc: "AI auto-detects meeting/lecture and formats accordingly",
        default: "Default Format",
        defaultDesc: "Meeting notes format (attendees, agenda, decisions, action items)",
        custom: "Custom Format",
        customDesc: "You can create up to 3 custom formats",
        addNew: "Add New Format",
        formatName: "Format Name",
        formatPrompt: "Prompt",
        promptPlaceholder: "e.g., Summarize the key points in 3 lines and list the action items.",
        setAsDefault: "Set as Default",
        isDefault: "Default",
        maxFormats: "Maximum 3 formats allowed",
        saveSuccess: "Format saved successfully.",
        saveFailed: "Failed to save format.",
        deleteSuccess: "Format deleted successfully.",
        deleteFailed: "Failed to delete format.",
        deleteConfirm: "Delete this format?",
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
        description: "One recording, automatic documentation.",
        getStarted: "Get Started",
      },
      step2: {
        title: "Here's what you can do",
        description: "Your documents are created automatically after recording",
        autoFormat: {
          title: "Smart Format Detection",
          description: "AI analyzes your recording to detect if it's a meeting or lecture, then formats accordingly.",
        },
        integrations: {
          title: "Service Integrations",
          description: "Connect with Notion, Google Docs, and Slack for auto-save and notifications.",
        },
        customFormat: {
          title: "Custom Formats",
          description: "Define your own summary style if you prefer.",
        },
        settingsTip: "You can configure integrations and formats anytime in Settings.",
        back: "Back",
        skip: "Skip",
        next: "Next",
      },
      step3: {
        title: "Summary Format Setup",
        description: "Set up the format for your recording summaries (can be changed later)",
        useDefault: "Use Default Format",
        defaultDesc: "Organized as meeting notes",
        createCustom: "Create Custom Format",
        customDesc: "Define your own summary style",
        formatName: "Format Name",
        formatPrompt: "Prompt",
        promptPlaceholder: "e.g., Summarize the key points in 3 lines and list the action items.",
        back: "Back",
        skip: "Skip",
        complete: "Complete Setup",
      },
    },

    // Auth
    auth: {
      signInWithGoogle: "Get Started",
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
