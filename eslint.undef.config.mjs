// Undefined-variable guard.
//
// WHY THIS EXISTS: a merge resolution once left `careerStats` referenced but
// never declared in useTickerSections.js. That is VALID SYNTAX, so `vite build`
// succeeded, every unit test passed, and it shipped — then threw
// "ReferenceError: careerStats is not defined" inside a useMemo on the
// dashboard, tripping the route error boundary so users saw "can't load
// dynasty." Nothing in the pipeline could have caught it except this rule.
//
// Deliberately ONLY no-undef: this is a correctness tripwire meant to stay at
// zero, not a style pass. `npm run lint:undef` must exit clean before any merge
// that resolved conflicts by hand.
//
// noInlineConfig is on so an inline eslint-disable can't hide a real bug; the
// two known-safe exceptions are listed as globals below.
const BROWSER = [
  'window','document','console','fetch','navigator','localStorage','sessionStorage',
  'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'cancelAnimationFrame','alert','confirm','prompt','Image','Blob','File','FileReader',
  'FormData','Headers','Request','Response','URL','URLSearchParams','TextEncoder',
  'TextDecoder','AbortController','AbortSignal','crypto','performance','location','history',
  'screen','IntersectionObserver','ResizeObserver','MutationObserver','CustomEvent','Event',
  'HTMLElement','Node','Element','SVGElement','DOMParser','XMLHttpRequest','WebSocket','Worker',
  'structuredClone','atob','btoa','createImageBitmap','queueMicrotask','reportError',
  'OffscreenCanvas','ImageData','getComputedStyle','matchMedia','scrollTo','CSS','Intl',
  'BroadcastChannel','indexedDB','caches','FontFace','ClipboardItem',
]
const NODE = ['process','Buffer','global','__dirname','__filename','module','require','exports','globalThis']
// Injected by vite.config.js at build time (see the version stamp).
const BUILD_DEFINES = ['__APP_VERSION__']

export default [
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries([...BROWSER, ...NODE, ...BUILD_DEFINES].map(k => [k, 'readonly'])),
    },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error' },
  },
]
