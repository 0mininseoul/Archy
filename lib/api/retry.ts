// =============================================================================
// Retry Utility - 외부 API 호출 재시도 로직
// =============================================================================

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * 지수 백오프를 사용한 재시도 래퍼
 *
 * 사용 예시:
 * ```ts
 * const result = await withRetry(
 *   () => fetch("https://api.example.com/data"),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
      const delay = Math.min(baseDelay + jitter, opts.maxDelayMs);

      opts.onRetry?.(attempt + 1, lastError, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * fetch 응답의 상태 코드 기반 재시도
 *
 * 사용 예시:
 * ```ts
 * const response = await fetchWithRetry("https://api.example.com/data", {
 *   method: "POST",
 *   body: JSON.stringify(data)
 * });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return withRetry(
    async () => {
      const response = await fetch(url, init);

      // 재시도 가능한 상태 코드인 경우 에러 throw
      if (opts.retryableStatusCodes.includes(response.status)) {
        const errorBody = await response.text().catch(() => "Unknown error");
        throw new RetryableError(
          `HTTP ${response.status}: ${errorBody}`,
          response.status
        );
      }

      return response;
    },
    {
      ...opts,
      onRetry: (attempt, error, delayMs) => {
        console.log(
          `[Retry] Attempt ${attempt}/${opts.maxRetries} after ${delayMs}ms: ${error.message}`
        );
        opts.onRetry?.(attempt, error, delayMs);
      },
    }
  );
}

/**
 * 재시도 가능한 에러 클래스
 */
export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

/**
 * 특정 시간 동안 대기
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 타임아웃과 함께 Promise 실행
 *
 * 사용 예시:
 * ```ts
 * const result = await withTimeout(
 *   fetch("https://api.example.com/data"),
 *   30000 // 30초
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
