"use client";

/**
 * Chunk Upload Manager
 *
 * 클라이언트 측 청크 업로드 관리
 * - 네트워크 실패 시 메모리에 보관 후 재시도
 * - Exponential backoff 재시도
 * - 네트워크 상태 감지
 */

export interface PendingChunk {
  id: string;
  chunkIndex: number;
  blob: Blob;
  durationSeconds: number;
  signalMetrics?: ChunkSignalMetrics;
  retryCount: number;
  createdAt: number;
}

export interface ChunkTranscriptResult {
  chunkIndex: number;
  transcript: string;
}

export interface ChunkSignalMetrics {
  avgRms?: number;
  peakRms?: number;
}

export type ChunkUploadSessionStatus =
  | "recording"
  | "processing"
  | "completed"
  | "failed";

export interface ChunkUploadFailure {
  code?: string;
  message: string;
  recoverable: boolean;
  retryAfterSeconds?: number;
  sessionStatus?: ChunkUploadSessionStatus;
  statusCode?: number;
  terminal?: boolean;
}

export interface ChunkUploadTerminalSession extends ChunkUploadFailure {
  failedChunkIndex: number;
}

export interface ChunkUploadCallbacks {
  onChunkUploaded?: (result: ChunkTranscriptResult) => void;
  onChunkFailed?: (chunkIndex: number, error: ChunkUploadFailure) => void;
  onRetrying?: (chunkIndex: number, retryCount: number) => void;
  onNetworkStatusChange?: (isOnline: boolean) => void;
  onSessionTerminated?: (error: ChunkUploadTerminalSession) => void;
}

export interface ChunkUploadOptions {
  sessionId?: string;
  callbacks?: ChunkUploadCallbacks;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1초
const MAX_RETRY_DELAY = 30000; // 30초

class ChunkUploadError extends Error {
  readonly failure: ChunkUploadFailure;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(failure: ChunkUploadFailure) {
    super(failure.message);
    this.name = "ChunkUploadError";
    this.failure = failure;
    this.retryable = failure.recoverable;
    this.retryAfterSeconds = failure.retryAfterSeconds;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * MIME 타입에 맞는 파일 확장자 반환
 */
function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm"; // 기본값
}

export class ChunkUploadManager {
  private pendingChunks: Map<string, PendingChunk> = new Map();
  private transcribedChunks: Map<number, string> = new Map();
  private callbacks: ChunkUploadCallbacks = {};
  private isOnline: boolean = true;
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private sessionId: string | null = null;
  private terminalSessionError: ChunkUploadTerminalSession | null = null;
  private totalDuration: number = 0;

  constructor(options?: ChunkUploadOptions | ChunkUploadCallbacks) {
    // 레거시 지원: callbacks만 전달된 경우
    if (options) {
      if (
        "onChunkUploaded" in options ||
        "onChunkFailed" in options ||
        "onSessionTerminated" in options
      ) {
        this.callbacks = options as ChunkUploadCallbacks;
      } else {
        const opts = options as ChunkUploadOptions;
        this.sessionId = opts.sessionId || null;
        if (opts.callbacks) {
          this.callbacks = opts.callbacks;
        }
      }
    }

    // 네트워크 상태 감지
    if (typeof window !== "undefined") {
      this.isOnline = navigator.onLine;

      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  setSessionId(sessionId: string): void {
    if (this.sessionId !== sessionId) {
      this.terminalSessionError = null;
    }
    this.sessionId = sessionId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  setTotalDuration(duration: number): void {
    this.totalDuration = duration;
  }

  private handleOnline = () => {
    this.isOnline = true;
    this.callbacks.onNetworkStatusChange?.(true);
    // 네트워크 복구 시 대기 중인 청크 재시도
    this.retryAllPendingChunks();
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.callbacks.onNetworkStatusChange?.(false);
  };

  /**
   * 청크 업로드 및 전사
   */
  async uploadChunk(
    chunkIndex: number,
    blob: Blob,
    durationSeconds: number,
    signalMetrics?: ChunkSignalMetrics
  ): Promise<ChunkTranscriptResult | null> {
    if (this.terminalSessionError) {
      console.warn(
        `[ChunkManager] Session ${this.sessionId ?? "unknown"} already terminated, skipping chunk ${chunkIndex}`
      );
      return null;
    }

    const chunkId = `chunk-${chunkIndex}-${Date.now()}`;

    // 대기 목록에 추가
    const pendingChunk: PendingChunk = {
      id: chunkId,
      chunkIndex,
      blob,
      durationSeconds,
      signalMetrics,
      retryCount: 0,
      createdAt: Date.now(),
    };
    this.pendingChunks.set(chunkId, pendingChunk);

    // 업로드 시도
    return this.attemptUpload(pendingChunk);
  }

  private async attemptUpload(
    chunk: PendingChunk
  ): Promise<ChunkTranscriptResult | null> {
    if (this.terminalSessionError) {
      return null;
    }

    // 오프라인이면 대기
    if (!this.isOnline) {
      console.log(`[ChunkManager] Offline, queueing chunk ${chunk.chunkIndex}`);
      return null;
    }

    try {
      const formData = new FormData();
      const extension = getExtensionFromMimeType(chunk.blob.type);
      formData.append("audio", chunk.blob, `chunk-${chunk.chunkIndex}.${extension}`);
      formData.append("chunkIndex", chunk.chunkIndex.toString());
      formData.append("durationSeconds", chunk.durationSeconds.toString());

      // 세션 기반 실시간 병합을 위한 추가 필드
      if (this.sessionId) {
        formData.append("sessionId", this.sessionId);
      }
      formData.append("totalDuration", this.totalDuration.toString());
      if (chunk.signalMetrics) {
        if (typeof chunk.signalMetrics.avgRms === "number") {
          formData.append("avgRms", chunk.signalMetrics.avgRms.toString());
        }
        if (typeof chunk.signalMetrics.peakRms === "number") {
          formData.append("peakRms", chunk.signalMetrics.peakRms.toString());
        }
      }

      const response = await fetch("/api/recordings/chunk", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let failure: ChunkUploadFailure = {
          message: `HTTP ${response.status}`,
          recoverable: isRetryableStatus(response.status),
          statusCode: response.status,
        };

        try {
          const errorData = await response.json();
          if (errorData?.error) {
            failure.message = errorData.error;
          }
          if (typeof errorData?.code === "string") {
            failure.code = errorData.code;
          }
          if (typeof errorData?.recoverable === "boolean") {
            failure.recoverable = errorData.recoverable;
          }
          if (typeof errorData?.terminal === "boolean") {
            failure.terminal = errorData.terminal;
          }
          if (
            typeof errorData?.sessionStatus === "string" &&
            ["recording", "processing", "completed", "failed"].includes(errorData.sessionStatus)
          ) {
            failure.sessionStatus = errorData.sessionStatus as ChunkUploadSessionStatus;
          }
          if (
            typeof errorData?.retryAfterSeconds === "number" &&
            Number.isFinite(errorData.retryAfterSeconds)
          ) {
            failure.retryAfterSeconds = errorData.retryAfterSeconds;
          }
        } catch {
          // Ignore JSON parsing errors and fall back to the HTTP status.
        }

        if (!failure.retryAfterSeconds) {
          const retryAfterHeader = response.headers.get("Retry-After");
          if (retryAfterHeader) {
            const parsedRetryAfter = Number.parseInt(retryAfterHeader, 10);
            if (Number.isFinite(parsedRetryAfter)) {
              failure.retryAfterSeconds = parsedRetryAfter;
            }
          }
        }

        throw new ChunkUploadError(failure);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Unknown error");
      }

      // 성공 - 대기 목록에서 제거
      this.pendingChunks.delete(chunk.id);
      this.clearRetryTimeout(chunk.id);

      // 결과 저장
      const result: ChunkTranscriptResult = {
        chunkIndex: data.data.chunkIndex,
        transcript: data.data.transcript,
      };
      this.transcribedChunks.set(result.chunkIndex, result.transcript);

      console.log(
        `[ChunkManager] Chunk ${chunk.chunkIndex} uploaded successfully`
      );
      this.callbacks.onChunkUploaded?.(result);

      return result;
    } catch (error) {
      const failure =
        error instanceof ChunkUploadError
          ? error.failure
          : {
              message: error instanceof Error ? error.message : "Unknown error",
              recoverable: true,
            };
      const retryable =
        !(error instanceof ChunkUploadError) || error.retryable;
      console.error(
        `[ChunkManager] Chunk ${chunk.chunkIndex} upload failed:`,
        failure.message
      );

      if (this.isTerminalSessionFailure(failure)) {
        this.pendingChunks.delete(chunk.id);
        this.clearRetryTimeout(chunk.id);
        this.abortSessionUploads(failure, chunk.chunkIndex);
        return null;
      }

      // 재시도 로직
      if (retryable && chunk.retryCount < MAX_RETRIES) {
        chunk.retryCount++;
        const retryAfterDelay =
          error instanceof ChunkUploadError &&
          typeof failure.retryAfterSeconds === "number" &&
          failure.retryAfterSeconds > 0
            ? failure.retryAfterSeconds * 1000
            : null;
        const delay = retryAfterDelay
          ? Math.min(retryAfterDelay, MAX_RETRY_DELAY)
          : Math.min(
              INITIAL_RETRY_DELAY * Math.pow(2, chunk.retryCount - 1),
              MAX_RETRY_DELAY
            );

        console.log(
          `[ChunkManager] Retrying chunk ${chunk.chunkIndex} in ${delay}ms (attempt ${chunk.retryCount}/${MAX_RETRIES})`
        );
        this.callbacks.onRetrying?.(chunk.chunkIndex, chunk.retryCount);

        // 재시도 스케줄링
        const timeout = setTimeout(() => {
          this.attemptUpload(chunk);
        }, delay);
        this.retryTimeouts.set(chunk.id, timeout);

        return null;
      } else {
        this.pendingChunks.delete(chunk.id);
        this.clearRetryTimeout(chunk.id);
        console.error(
          retryable
            ? `[ChunkManager] Chunk ${chunk.chunkIndex} failed after ${MAX_RETRIES} retries`
            : `[ChunkManager] Chunk ${chunk.chunkIndex} failed with a non-retryable error`
        );
        this.callbacks.onChunkFailed?.(chunk.chunkIndex, failure);
        return null;
      }
    }
  }

  private isTerminalSessionFailure(failure: ChunkUploadFailure): boolean {
    return Boolean(
      failure.terminal ||
      failure.code === "recording_not_active" ||
      (failure.sessionStatus && failure.sessionStatus !== "recording")
    );
  }

  private abortSessionUploads(
    failure: ChunkUploadFailure,
    failedChunkIndex: number
  ): void {
    const terminalFailure: ChunkUploadTerminalSession = {
      ...failure,
      failedChunkIndex,
      terminal: true,
    };
    this.terminalSessionError = terminalFailure;

    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();
    this.pendingChunks.clear();

    this.callbacks.onSessionTerminated?.(terminalFailure);
  }

  /**
   * 대기 중인 모든 청크 재시도
   */
  private retryAllPendingChunks(): void {
    if (this.terminalSessionError) {
      return;
    }

    console.log(
      `[ChunkManager] Retrying ${this.pendingChunks.size} pending chunks`
    );

    for (const chunk of this.pendingChunks.values()) {
      // 기존 재시도 타이머 취소
      this.clearRetryTimeout(chunk.id);
      // 즉시 재시도
      this.attemptUpload(chunk);
    }
  }

  private clearRetryTimeout(chunkId: string): void {
    const timeout = this.retryTimeouts.get(chunkId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(chunkId);
    }
  }

  /**
   * 대기 중인 청크 수
   */
  getPendingCount(): number {
    return this.pendingChunks.size;
  }

  /**
   * 전사된 청크 수
   */
  getTranscribedCount(): number {
    return this.transcribedChunks.size;
  }

  /**
   * 모든 전사 결과 반환 (순서대로)
   */
  getAllTranscripts(): ChunkTranscriptResult[] {
    const results: ChunkTranscriptResult[] = [];

    // chunkIndex 순서대로 정렬
    const sortedIndices = Array.from(this.transcribedChunks.keys()).sort(
      (a, b) => a - b
    );

    for (const index of sortedIndices) {
      const transcript = this.transcribedChunks.get(index);
      if (transcript) {
        results.push({ chunkIndex: index, transcript });
      }
    }

    return results;
  }

  /**
   * 모든 청크가 처리되었는지 확인
   */
  isAllChunksProcessed(expectedCount: number): boolean {
    return (
      this.transcribedChunks.size >= expectedCount &&
      this.pendingChunks.size === 0
    );
  }

  /**
   * 대기 중인 청크가 있는지 확인
   */
  hasPendingChunks(): boolean {
    return this.pendingChunks.size > 0;
  }

  /**
   * 모든 대기 중인 청크가 업로드될 때까지 대기
   */
  async waitForAllPending(timeoutMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (this.pendingChunks.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn("[ChunkManager] Timeout waiting for pending chunks");
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return true;
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    // 모든 재시도 타이머 취소
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();

    // 이벤트 리스너 제거
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }

    // 상태 초기화
    this.pendingChunks.clear();
    this.transcribedChunks.clear();
    this.sessionId = null;
    this.totalDuration = 0;
    this.terminalSessionError = null;
  }

  /**
   * 상태 리셋 (새 녹음 시작 시)
   */
  reset(): void {
    this.cleanup();

    // 네트워크 리스너 재등록
    if (typeof window !== "undefined") {
      this.isOnline = navigator.onLine;
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }
}

// 싱글톤 인스턴스 (옵션)
let instance: ChunkUploadManager | null = null;

export function getChunkUploadManager(
  callbacks?: ChunkUploadCallbacks
): ChunkUploadManager {
  if (!instance) {
    instance = new ChunkUploadManager(callbacks);
  }
  return instance;
}

export function resetChunkUploadManager(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}
