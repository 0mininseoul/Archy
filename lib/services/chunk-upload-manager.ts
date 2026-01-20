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
  retryCount: number;
  createdAt: number;
}

export interface ChunkTranscriptResult {
  chunkIndex: number;
  transcript: string;
}

export interface ChunkUploadCallbacks {
  onChunkUploaded?: (result: ChunkTranscriptResult) => void;
  onChunkFailed?: (chunkIndex: number, error: string) => void;
  onRetrying?: (chunkIndex: number, retryCount: number) => void;
  onNetworkStatusChange?: (isOnline: boolean) => void;
}

export interface ChunkUploadOptions {
  sessionId?: string;
  callbacks?: ChunkUploadCallbacks;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1초
const MAX_RETRY_DELAY = 30000; // 30초

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
  private totalDuration: number = 0;

  constructor(options?: ChunkUploadOptions | ChunkUploadCallbacks) {
    // 레거시 지원: callbacks만 전달된 경우
    if (options) {
      if ('onChunkUploaded' in options || 'onChunkFailed' in options) {
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
    durationSeconds: number
  ): Promise<ChunkTranscriptResult | null> {
    const chunkId = `chunk-${chunkIndex}-${Date.now()}`;

    // 대기 목록에 추가
    const pendingChunk: PendingChunk = {
      id: chunkId,
      chunkIndex,
      blob,
      durationSeconds,
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

      const response = await fetch("/api/recordings/chunk", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[ChunkManager] Chunk ${chunk.chunkIndex} upload failed:`,
        errorMessage
      );

      // 재시도 로직
      if (chunk.retryCount < MAX_RETRIES) {
        chunk.retryCount++;
        const delay = Math.min(
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
        // 최대 재시도 횟수 초과
        console.error(
          `[ChunkManager] Chunk ${chunk.chunkIndex} failed after ${MAX_RETRIES} retries`
        );
        this.callbacks.onChunkFailed?.(chunk.chunkIndex, errorMessage);
        return null;
      }
    }
  }

  /**
   * 대기 중인 모든 청크 재시도
   */
  private retryAllPendingChunks(): void {
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
