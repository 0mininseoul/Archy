export interface SafeStorageOptions {
  logPrefix?: string;
}

function getPrefix(options?: SafeStorageOptions): string {
  return options?.logPrefix || "SafeStorage";
}

export function safeLocalStorageGetItem(
  key: string,
  options?: SafeStorageOptions
): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] localStorage get failed for key "${key}":`, error);
    return null;
  }
}

export function safeLocalStorageSetItem(
  key: string,
  value: string,
  options?: SafeStorageOptions
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] localStorage set failed for key "${key}":`, error);
  }
}

export function safeLocalStorageRemoveItem(
  key: string,
  options?: SafeStorageOptions
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] localStorage remove failed for key "${key}":`, error);
  }
}

export function safeSessionStorageGetItem(
  key: string,
  options?: SafeStorageOptions
): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] sessionStorage get failed for key "${key}":`, error);
    return null;
  }
}

export function safeSessionStorageSetItem(
  key: string,
  value: string,
  options?: SafeStorageOptions
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] sessionStorage set failed for key "${key}":`, error);
  }
}

export function safeSessionStorageRemoveItem(
  key: string,
  options?: SafeStorageOptions
): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`[${getPrefix(options)}] sessionStorage remove failed for key "${key}":`, error);
  }
}
