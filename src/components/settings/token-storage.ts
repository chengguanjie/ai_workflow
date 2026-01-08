'use client'

export type RememberMode = 'none' | 'session' | 'local'

// localStorage keys
const KEY_MODE = 'ai-workflow:apiTester:rememberMode'
const KEY_TOKEN_LOCAL = 'ai-workflow:apiTester:manualToken'
const KEY_TOKEN_SESSION = 'ai-workflow:apiTester:manualToken:session'

// Lightweight obfuscation (NOT security boundary). Prevents casual shoulder-surfing via localStorage viewer.
// Uses XOR with a fixed salt + base64.
const SALT = 'ai-workflow-obf-v1'

function xor(input: string, salt: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    out += String.fromCharCode(input.charCodeAt(i) ^ salt.charCodeAt(i % salt.length))
  }
  return out
}

function b64encode(str: string): string {
  return typeof window === 'undefined' ? str : window.btoa(unescape(encodeURIComponent(str)))
}

function b64decode(str: string): string {
  return typeof window === 'undefined' ? str : decodeURIComponent(escape(window.atob(str)))
}

export function obfuscate(token: string): string {
  try {
    return b64encode(xor(token, SALT))
  } catch {
    return token
  }
}

export function deobfuscate(token: string): string {
  try {
    return xor(b64decode(token), SALT)
  } catch {
    return token
  }
}

export function loadRememberMode(): RememberMode {
  try {
    const m = window.localStorage.getItem(KEY_MODE) as RememberMode | null
    return m === 'local' || m === 'session' || m === 'none' ? m : 'local'
  } catch {
    return 'local'
  }
}

export function saveRememberMode(mode: RememberMode): void {
  try {
    window.localStorage.setItem(KEY_MODE, mode)
  } catch {
    // ignore
  }
}

export function loadManualToken(mode: RememberMode): string {
  try {
    if (mode === 'local') {
      const v = window.localStorage.getItem(KEY_TOKEN_LOCAL)
      return v ? deobfuscate(v) : ''
    }
    if (mode === 'session') {
      return window.sessionStorage.getItem(KEY_TOKEN_SESSION) || ''
    }
    return ''
  } catch {
    return ''
  }
}

export function saveManualToken(mode: RememberMode, token: string): void {
  try {
    if (mode === 'local') {
      window.localStorage.setItem(KEY_TOKEN_LOCAL, obfuscate(token))
      window.sessionStorage.removeItem(KEY_TOKEN_SESSION)
      return
    }
    if (mode === 'session') {
      window.sessionStorage.setItem(KEY_TOKEN_SESSION, token)
      window.localStorage.removeItem(KEY_TOKEN_LOCAL)
      return
    }
    // none
    window.localStorage.removeItem(KEY_TOKEN_LOCAL)
    window.sessionStorage.removeItem(KEY_TOKEN_SESSION)
  } catch {
    // ignore
  }
}

export function clearManualTokenEverywhere(): void {
  try {
    window.localStorage.removeItem(KEY_TOKEN_LOCAL)
    window.sessionStorage.removeItem(KEY_TOKEN_SESSION)
  } catch {
    // ignore
  }
}
