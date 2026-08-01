import { createPortal } from 'react-dom'

// Full-screen view of a recruit's commit graphic. A translucent Edit button
// sits in the top-left corner of the image; tapping it hands off to the edit
// modal. Backdrop or the X closes it.
export default function CommitGraphicViewer({ isOpen, onClose, url, onEdit }) {
  if (!isOpen || !url) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] bg-black/85 flex items-center justify-center p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div className="relative max-w-full max-h-full" onMouseDown={(e) => e.stopPropagation()}>
        <img
          src={url}
          alt="Commit graphic"
          className="max-w-full max-h-[92dvh] object-contain rounded-lg shadow-2xl"
        />

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit commit graphic"
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-black/40 hover:bg-black/70 backdrop-blur-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-white bg-black/40 hover:bg-black/70 backdrop-blur-sm transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
