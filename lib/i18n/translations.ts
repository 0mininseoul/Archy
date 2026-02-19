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
      settingsTooltip: "설정에서 서비스를 연동해보세요!",
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
        description: "더 이상 기록은 걱정하지 마세요.\n대화에 집중하고, 나머지는 Archy에게 맡기세요.",
        recording: {
          title: "고품질 녹음",
          description: "자동 저장과 클라우드 백업이 되는 웹 녹음. 최대 120분까지.",
        },
        transcription: {
          title: "즉시 전사",
          description: "Whisper API로 다국어 99% 정확도를 자랑합니다.",
        },
        summarization: {
          title: "AI 자동 요약",
          description: "형식에 맞춰 핵심 내용과 할 일을 깔끔하게 정리해드립니다.",
        },
        notifications: {
          title: "스마트 알림",
          description: "요약이 완료되면 슬랙과 푸시 알림으로 즉시 알려드립니다.",
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
        rights: "©2025 ARCHY · All rights reserved.",
        ceo: "ARCHY | CEO: Youngmin Park",
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
      notionAndGoogleNotConnected: "Notion과 Google이 모두 연결되지 않았습니다. 녹음 내용이 저장되지 않습니다.",
      // Chunking
      chunkProgress: "청크 {current}/{total} 처리 중...",
      pendingChunks: "{count}개 청크 대기 중",
      finalizingRecording: "녹음 완료 중...",
      networkOffline: "네트워크 연결 끊김",
      networkReconnected: "네트워크 재연결됨",
      chunkUploadFailed: "청크 업로드 실패. 재시도 중...",
      // iOS Background Warning
      iosBackgroundWarning: "iOS에서 다른 앱으로 이동하거나 화면을 잠금하면 녹음이 중단될 수 있습니다.",
      iosBackgroundWarningDismiss: "알겠습니다",
    },

    // Recording Guide Modal
    recordingGuide: {
      title: "녹음을 시작합니다",
      keepScreen: "녹음 중에는 화면을 유지해 주세요.",
      keepScreenDesc: "홈 화면이나 다른 앱으로 이동하면 녹음이 일시정지됩니다.",
      stealthMode: "화면이 자동으로 어두워집니다.",
      stealthModeDesc: '화면을 "두 번" 탭하면 다시 밝아집니다.',
      pushDenied: "알림이 꺼져 있어 녹음 중단 시 알려드릴 수 없습니다.",
      enablePush: "알림 켜기",
      confirm: "확인하고 녹음 시작",
    },

    // Resume Modal
    resumeModal: {
      title: "녹음이 일시정지되었습니다",
      recordedSoFar: "현재까지 녹음",
      resume: "이어서 녹음",
      saveHere: "여기까지만 저장",
      discard: "녹음 취소",
    },

    // Stealth Mode
    stealthMode: {
      hint: "두 번 탭하면 화면이 밝아집니다",
      enterStealth: "화면 끄기",
    },

    // History
    history: {
      title: "녹음 기록",
      open: "열기",
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
      processingNotice: {
        base: "이 페이지에서 나가셔도 자동 처리됩니다.",
        slack: "완료되면 슬랙으로 알려드릴게요 :)",
        push: "완료되면 푸시알림으로 알려드릴게요 :)",
        all: "완료되면 알려드릴게요 :)",
      },
      noRecordings: "녹음이 없습니다",
      noRecordingsDesc: "첫 번째 회의나 아이디어를 기록해보세요.",
      startRecording: "녹음 시작하기",
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
        proExpires: "{days}일 후 만료",
        unlimited: "무제한 사용 가능",
      },
      invite: {
        title: "친구 초대",
        description: "친구를 초대하면 나도 친구도 350분 추가!",
        myCode: "내 추천 코드",
        earnedBonus: "획득한 보너스",
        kakao: "카카오톡",
        instagram: "인스타 DM",
        copied: "복사됨!",
        hint: "인스타그램은 메시지가 복사되어 DM에서 붙여넣기하세요",
      },
      integrations: {
        title: "연동",
        description: "원하는 서비스를 연동해 보세요!",
        notion: {
          title: "Notion",
          connected: "데이터베이스에 자동 저장 활성화됨",
          selectDb: "저장 위치를 선택하세요",
          notConnected: "Notion에 자동 저장",
          configure: "설정",
          connect: "Notion 연결",
          troubleshoot: "Notion 연동이 안 되시나요?",
          manualModal: {
            title: "수동 연결 설정",
            description: "다른 워크스페이스의 게스트인 경우, 워크스페이스 관리자에게 Internal Integration을 요청해야 합니다.",
            step1: "1. 워크스페이스 관리자에게 Internal Integration 생성을 요청하세요",
            step2: "2. 관리자가 저장할 페이지에 Integration을 연결해야 합니다",
            step3: "3. 관리자에게 Integration Token을 받아 아래에 입력하세요",
            guideLink: "Notion Integration 생성 가이드",
            tokenLabel: "Integration Token",
            tokenPlaceholder: "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            pageUrlLabel: "저장할 페이지 URL",
            pageUrlPlaceholder: "https://www.notion.so/...",
            connect: "연결하기",
            connecting: "연결 중...",
            success: "Notion이 연결되었습니다!",
            errorInvalidToken: "유효하지 않은 토큰입니다. 토큰을 확인해주세요.",
            errorInvalidUrl: "유효하지 않은 Notion URL입니다.",
            errorNoAccess: "해당 페이지에 접근 권한이 없습니다. Integration이 페이지에 연결되었는지 확인해주세요.",
            errorGeneric: "연결에 실패했습니다. 다시 시도해주세요.",
          },
        },
        google: {
          title: "Google Docs",
          description: "구글 드라이브에 자동으로 문서 저장",
          connected: "구글 드라이브에 자동 저장 활성화됨",
          notConnected: "Google Docs에 자동 저장",
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
        maxFormats: "Free 플랜에서는 최대 1개까지 만들 수 있습니다",
        saveSuccess: "포맷이 저장되었습니다.",
        saveFailed: "포맷 저장에 실패했습니다.",
        deleteSuccess: "포맷이 삭제되었습니다.",
        deleteFailed: "포맷 삭제에 실패했습니다.",
        deleteConfirm: "이 포맷을 삭제하시겠습니까?",
        editSuccess: "포맷이 수정되었습니다.",
        editFailed: "포맷 수정에 실패했습니다.",
        setDefaultFailed: "기본값 설정에 실패했습니다.",
      },
      data: {
        title: "데이터 관리",
        audioStorage: "오디오 저장",
        audioStorageDesc: "녹음 파일을 저장하여 나중에 다시 들을 수 있습니다",
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
      contact: "문의하기",
      contactPage: {
        title: "문의하기",
        description: "서비스 관련 문의사항이 있으시면 아래 이메일로 연락해 주세요.",
        email: "이메일",
        withdraw: "탈퇴하기",
      },
      withdrawPage: {
        title: "정말 떠나시는 건가요? 😢",
        description: "탈퇴하시면 모든 녹음 기록, 커스텀 포맷, 연동 정보가 영구적으로 삭제되며 복구할 수 없습니다.",
        warning: "잠깐! 다시 한번 생각해 보세요",
        warningItems: [
          "지금까지 녹음한 모든 기록이 사라져요",
          "연동한 서비스 정보도 모두 삭제돼요",
          "나중에 다시 가입해도 데이터는 복구되지 않아요"
        ],
        reasonLabel: "탈퇴 사유 (선택사항)",
        reasonPlaceholder: "탈퇴 사유를 선택해 주세요",
        reasons: {
          noLongerNeeded: "서비스를 더 이상 사용하지 않아요",
          switchingService: "다른 서비스로 이동해요",
          lackingFeatures: "필요한 기능이 부족해요",
          difficultToUse: "사용하기 어려워요",
          privacyConcerns: "개인정보 보호가 걱정돼요",
          tooExpensive: "가격이 부담돼요",
          other: "기타",
        },
        skipReason: "선택 안 함",
        confirmButton: "네 ㅠㅠ",
        cancelButton: "다시 생각해볼게요",
      },
      withdrawComplete: {
        title: "탈퇴가 완료되었습니다",
        description: "그동안 Archy를 이용해 주셔서 감사합니다.\n언제든 다시 돌아오시면 환영합니다! 👋",
        homeButton: "홈으로 돌아가기",
      },
      language: {
        title: "언어 설정",
        description: "서비스 표시 언어를 선택하세요",
        korean: "한국어",
        english: "English",
      },
      pushNotification: {
        title: "푸시 알림",
        description: "녹음 처리 완료 시 푸시 알림을 받습니다",
        enable: "알림 받기",
        enabled: "알림 켜짐",
        disabled: "알림 꺼짐",
        notSupported: "이 브라우저에서는 푸시 알림을 지원하지 않습니다",
        permissionDenied: "알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요",
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
      promoApplied: "프로모션이 적용되었습니다! Pro 혜택을 누려보세요.",
      promoExpires: "{days}일 후 만료",
      step1: {
        title: "Archy에 오신 것을 환영합니다",
        description: "녹음 한 번으로 완성되는 자동 문서화 서비스입니다.",
        getStarted: "시작하기",
        referralQuestion: "친구에게 추천받으셨나요?",
        referralPlaceholder: "추천 코드 입력",
        referralApply: "적용",
        referralSuccess: "추천 코드가 적용되었습니다! 350분이 추가됩니다.",
        referralError: "오류가 발생했습니다. 다시 시도해주세요.",
        referralNotFound: "존재하지 않는 추천 코드입니다.",
        referralSelf: "본인의 추천 코드는 사용할 수 없습니다.",
        referralInvalidFormat: "코드는 8자리여야 합니다.",
        referralAlreadyUsed: "이미 추천 코드를 사용하셨습니다.",
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
          description: "Notion, Google Docs, Slack과 연동하고 푸시 알림으로 완료 소식을 받아보세요.",
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

    // Desktop Login Notice Modal
    desktopLoginNotice: {
      title: "모바일 이용을 권장드려요",
      description: "Archy는 모바일 환경에 최적화된 서비스입니다.\nPC에서도 사용할 수 있지만 일부 기능은 제한될 수 있어요.\n모바일 브라우저에서 이용하시면 더 편리합니다.",
      copy: "링크 복사",
      copySuccess: "복사됨!",
      copyFailed: "복사에 실패했어요. 아래 링크를 직접 복사해 주세요.",
      close: "닫기",
    },

    // PWA Modal
    pwaModal: {
      title: "앱으로 설치하기",
      description: "홈 화면에 추가하면 더 빠르고 편리하게 사용할 수 있습니다.",
      benefits: {
        fast: "앱처럼 빠르게 실행",
        fullscreen: "전체 화면으로 사용",
        offline: "오프라인에서도 접근 가능",
      },
      install: "홈 화면에 추가",
      iosSafari: {
        title: "설치 방법",
        step1: "화면 하단",
        step2: "홈 화면에 추가",
      },
      iosChrome: {
        step1: "화면 상단 우측의 공유 버튼을 탭하세요",
        step2: "'홈 화면에 추가'를 선택하세요",

      },
      desktopMessage: "모바일에서 더 편리하게 사용할 수 있어요!",
      browserNotSupported: "이 브라우저에서는 홈 화면 추가 기능을 사용할 수 없습니다.",
      later: "나중에",
    },

    // In-App Browser Modal
    inAppBrowser: {
      title: "외부 브라우저에서 열어주세요",
      description: "원활한 서비스 이용을 위해\nSafari에서 열어주세요.",
      confirm: "확인",
      // 앱별 안내
      apps: {
        kakaotalk: {
          step1: "우측 상단의",
          icon: "⋮",
          step2: "메뉴를 탭하세요",
          step3: "'다른 브라우저로 열기'를 선택하세요",
        },
        instagram: {
          step1: "우측 상단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
        threads: {
          step1: "우측 상단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
        facebook: {
          step1: "우측 하단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
        linkedin: {
          step1: "우측 상단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'브라우저에서 열기'를 선택하세요",
        },
        line: {
          step1: "우측 상단의",
          icon: "⋮",
          step2: "메뉴를 탭하세요",
          step3: "'Safari로 열기'를 선택하세요",
        },
        naver: {
          step1: "우측 상단의",
          icon: "⋮",
          step2: "메뉴를 탭하세요",
          step3: "'Safari로 열기'를 선택하세요",
        },
        telegram: {
          step1: "우측 상단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
        twitter: {
          step1: "우측 상단의",
          icon: "⋯",
          step2: "메뉴를 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
        default: {
          step1: "상단 또는 하단의",
          icon: "⋯",
          step2: "메뉴나 공유 버튼을 탭하세요",
          step3: "'Safari에서 열기'를 선택하세요",
        },
      },
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
      settingsTooltip: "Connect services in Settings!",
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
        description: "Stop worrying about taking notes. Focus on the conversation and let Archy handle the rest.",
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
        notifications: {
          title: "Smart Notifications",
          description: "Get instant alerts via Slack and Push when summaries are ready.",
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
        rights: "©2025 ARCHY · All rights reserved.",
        ceo: "ARCHY | CEO: Youngmin Park",
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
      // Chunking
      chunkProgress: "Processing chunk {current}/{total}...",
      pendingChunks: "{count} chunks pending",
      finalizingRecording: "Finalizing recording...",
      networkOffline: "Network disconnected",
      networkReconnected: "Network reconnected",
      chunkUploadFailed: "Chunk upload failed. Retrying...",
      // iOS Background Warning
      iosBackgroundWarning: "On iOS, switching to another app or locking the screen may stop the recording.",
      iosBackgroundWarningDismiss: "Got it",
    },

    // Recording Guide Modal
    recordingGuide: {
      title: "Starting Recording",
      keepScreen: "Please keep the screen on while recording.",
      keepScreenDesc: "Recording will pause if you switch to home screen or another app.",
      stealthMode: "The screen will automatically dim.",
      stealthModeDesc: "Double tap to brighten it again.",
      pushDenied: "Notifications are off, so we can't alert you if recording stops.",
      enablePush: "Enable notifications",
      confirm: "Got it, start recording",
    },

    // Resume Modal
    resumeModal: {
      title: "Recording paused",
      recordedSoFar: "Recorded so far",
      resume: "Continue recording",
      saveHere: "Save up to here",
      discard: "Cancel recording",
    },

    // Stealth Mode
    stealthMode: {
      hint: "Double tap to brighten the screen",
      enterStealth: "Dim screen",
    },

    // History
    history: {
      title: "Recording History",
      open: "Open",
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
      processingNotice: {
        base: "Processing will continue in the background.",
        slack: "We'll notify you on Slack when it's done :)",
        push: "We'll notify you via push notification when it's done :)",
        all: "We'll notify you when it's done :)",
      },
      noRecordings: "No recordings found",
      noRecordingsDesc: "Start recording your meetings or ideas.",
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
        proExpires: "Expires in {days} days",
        unlimited: "Unlimited usage",
      },
      invite: {
        title: "Invite Friends",
        description: "Invite friends and both get 350 bonus minutes!",
        myCode: "My Referral Code",
        earnedBonus: "Earned Bonus",
        kakao: "KakaoTalk",
        instagram: "Instagram DM",
        copied: "Copied!",
        hint: "For Instagram, the message is copied. Paste it in DM.",
      },
      integrations: {
        title: "Integrations",
        description: "Connect your favorite services!",
        notion: {
          title: "Notion",
          connected: "Auto-save to database enabled",
          selectDb: "Select a save location",
          notConnected: "Auto-save to Notion",
          configure: "Configure",
          connect: "Connect Notion",
          troubleshoot: "Having trouble connecting Notion?",
          manualModal: {
            title: "Manual Connection Setup",
            description: "If you're a guest in another workspace, you need to request an Internal Integration from the workspace admin.",
            step1: "1. Ask the workspace admin to create an Internal Integration",
            step2: "2. The admin must connect the Integration to the target page",
            step3: "3. Get the Integration Token from the admin and enter it below",
            guideLink: "Notion Integration Guide",
            tokenLabel: "Integration Token",
            tokenPlaceholder: "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            pageUrlLabel: "Page URL to save to",
            pageUrlPlaceholder: "https://www.notion.so/...",
            connect: "Connect",
            connecting: "Connecting...",
            success: "Notion connected successfully!",
            errorInvalidToken: "Invalid token. Please check your token.",
            errorInvalidUrl: "Invalid Notion URL.",
            errorNoAccess: "No access to this page. Make sure the Integration is connected to the page.",
            errorGeneric: "Connection failed. Please try again.",
          },
        },
        google: {
          title: "Google Docs",
          description: "Auto-save documents to Google Drive",
          connected: "Auto-save to Google Drive enabled",
          notConnected: "Auto-save to Google Docs",
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
        maxFormats: "Free plan allows up to 1 custom format",
        saveSuccess: "Format saved successfully.",
        saveFailed: "Failed to save format.",
        deleteSuccess: "Format deleted successfully.",
        deleteFailed: "Failed to delete format.",
        deleteConfirm: "Delete this format?",
        editSuccess: "Format updated successfully.",
        editFailed: "Failed to update format.",
        setDefaultFailed: "Failed to set as default.",
      },
      data: {
        title: "Data Management",
        audioStorage: "Audio Storage",
        audioStorageDesc: "Save recordings to listen again later",
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
      contact: "Contact",
      contactPage: {
        title: "Contact",
        description: "If you have any questions about the service, please contact us at the email below.",
        email: "Email",
        withdraw: "Delete Account",
      },
      withdrawPage: {
        title: "Are you sure you want to leave? 😢",
        description: "If you delete your account, all recordings, custom formats, and integration information will be permanently deleted and cannot be recovered.",
        warning: "Wait! Please think again",
        warningItems: [
          "All your recordings will be deleted",
          "All connected service data will be removed",
          "Data cannot be recovered even if you sign up again"
        ],
        reasonLabel: "Reason for withdrawal (optional)",
        reasonPlaceholder: "Please select a reason",
        reasons: {
          noLongerNeeded: "I no longer need the service",
          switchingService: "Switching to another service",
          lackingFeatures: "Missing features I need",
          difficultToUse: "Difficult to use",
          privacyConcerns: "Privacy concerns",
          tooExpensive: "Too expensive",
          other: "Other",
        },
        skipReason: "Skip",
        confirmButton: "Yes, delete",
        cancelButton: "Let me think again",
      },
      withdrawComplete: {
        title: "Account Deleted",
        description: "Thank you for using Archy.\nWe hope to see you again! 👋",
        homeButton: "Go to Home",
      },
      language: {
        title: "Language Settings",
        description: "Choose your preferred display language",
        korean: "한국어",
        english: "English",
      },
      pushNotification: {
        title: "Push Notifications",
        description: "Get notified when recording processing is complete",
        enable: "Enable notifications",
        enabled: "Notifications on",
        disabled: "Notifications off",
        notSupported: "Push notifications are not supported in this browser",
        permissionDenied: "Notification permission denied. Please allow in browser settings",
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
      promoApplied: "Promo applied! Enjoy your Pro benefits.",
      promoExpires: "Expires in {days} days",
      step1: {
        title: "Welcome to Archy",
        description: "One recording, automatic documentation.",
        getStarted: "Get Started",
        referralQuestion: "Got a referral code?",
        referralPlaceholder: "Enter referral code",
        referralApply: "Apply",
        referralSuccess: "Referral code applied! 350 minutes added.",
        referralError: "An error occurred. Please try again.",
        referralNotFound: "Referral code not found.",
        referralSelf: "You cannot use your own referral code.",
        referralInvalidFormat: "Code must be 8 characters long.",
        referralAlreadyUsed: "You have already used a referral code.",
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
          description: "Connect with Notion, Google Docs, Slack, and get notified via Push when done.",
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

    // Desktop Login Notice Modal
    desktopLoginNotice: {
      title: "Mobile Is Recommended",
      description: "Archy is optimized for mobile use.\nYou can still use it on desktop, but some features may be limited.\nFor the best experience, please continue on mobile.",
      copy: "Copy Link",
      copySuccess: "Copied!",
      copyFailed: "Copy failed. Please copy the link manually.",
      close: "Close",
    },

    // PWA Modal
    pwaModal: {
      title: "Install as App",
      description: "Add to home screen for faster and easier access.",
      benefits: {
        fast: "Launch like an app",
        fullscreen: "Use in full screen",
        offline: "Access offline",
      },
      install: "Add to Home Screen",
      iosSafari: {
        title: "How to Install",
        step1: "Tap bottom",
        step2: "Add to Home Screen",
      },
      iosChrome: {
        step1: "Tap the share button at the top right",
        step2: "Select 'Add to Home Screen'",

      },
      desktopMessage: "Use on mobile for a better experience!",
      browserNotSupported: "Add to home screen is not supported in this browser.",
      later: "Later",
    },

    // In-App Browser Modal
    inAppBrowser: {
      title: "Open in External Browser",
      description: "For the best experience,\nplease open in Safari.",
      confirm: "OK",
      // App-specific instructions
      apps: {
        kakaotalk: {
          step1: "Tap the",
          icon: "⋮",
          step2: "menu at the top right",
          step3: "Select 'Open in other browser'",
        },
        instagram: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        threads: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        facebook: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the bottom right",
          step3: "Select 'Open in Safari'",
        },
        linkedin: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the top right",
          step3: "Select 'Open in browser'",
        },
        line: {
          step1: "Tap the",
          icon: "⋮",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        naver: {
          step1: "Tap the",
          icon: "⋮",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        telegram: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        twitter: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu at the top right",
          step3: "Select 'Open in Safari'",
        },
        default: {
          step1: "Tap the",
          icon: "⋯",
          step2: "menu or share button",
          step3: "Select 'Open in Safari'",
        },
      },
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
