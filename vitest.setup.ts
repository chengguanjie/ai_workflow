import { vi, afterEach } from 'vitest'
import '@testing-library/dom'

// Happy DOM: avoid throwing when DOMPurify encounters <script src="..."> or <link href="...">
// We never want tests to perform external resource loading; treat it as a successful no-op.
if (typeof window !== 'undefined') {
  const happyDOM = (window as any).happyDOM
  if (happyDOM?.settings) {
    happyDOM.settings.disableJavaScriptFileLoading = true
    happyDOM.settings.disableCSSFileLoading = true
    if (happyDOM.settings.navigation) {
      happyDOM.settings.navigation.disableMainFrameNavigation = true
      happyDOM.settings.navigation.disableChildFrameNavigation = true
      happyDOM.settings.navigation.disableChildPageNavigation = true
      happyDOM.settings.navigation.disableFallbackToSetURL = true
    }
    happyDOM.settings.handleDisabledFileLoadingAsSuccess = true
  }
}

// Mock xlsx module
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
  utils: {
    sheet_to_json: vi.fn(() => []),
  },
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next-auth
vi.mock('next-auth', () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}))

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks()
})
