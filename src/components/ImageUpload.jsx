import { useState, useRef } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

/**
 * Reusable image upload component with ImgBB integration
 * Supports: file selection, drag & drop, and paste from clipboard
 *
 * Props:
 * - value: current image URL
 * - onChange: callback when image URL changes
 * - teamColors: { primary, secondary } for styling
 * - placeholder: placeholder text for input (optional)
 * - showPreview: whether to show image preview (default: true)
 * - compact: use compact layout (default: false)
 * - disabled: disable the component (default: false)
 */
export default function ImageUpload({
  value,
  onChange,
  teamColors = { primary: '#1f2937', secondary: '#f3f4f6' },
  placeholder = 'Paste image (Ctrl+V) or enter URL...',
  showPreview = true,
  compact = false,
  disabled = false
}) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Upload image to ImgBB
  const uploadToImgBB = async (file) => {
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
    if (!apiKey) {
      toast.error('Image upload not configured. Please add VITE_IMGBB_API_KEY to environment variables.')
      return null
    }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('key', apiKey)

    try {
      setUploading(true)
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()

      if (data.success) {
        return data.data.url
      } else {
        toast.error('Failed to upload image: ' + (data.error?.message || 'Unknown error'))
        return null
      }
    } catch (error) {
      toast.error('Failed to upload image: ' + error.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  // Validate and upload file
  const handleFile = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 32MB for ImgBB)
    if (file.size > 32 * 1024 * 1024) {
      toast.error('Image must be less than 32MB')
      return
    }

    const url = await uploadToImgBB(file)
    if (url) {
      onChange(url)
    }
  }

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    await handleFile(file)
    e.target.value = '' // Reset so same file can be selected again
  }

  // Handle paste event
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          await handleFile(file)
        }
        return
      }
    }
  }

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    if (disabled) return

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      await handleFile(files[0])
    }
  }

  // Handle clipboard button click (for mobile)
  const handleClipboardPaste = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const file = new File([blob], 'pasted-image.png', { type: imageType })
          await handleFile(file)
          return
        }
      }
      toast.error('No image found in clipboard')
    } catch (error) {
      toast.error('Could not access clipboard. Try using Ctrl+V instead.')
    }
  }

  if (compact) {
    // Compact layout - just input with paste support
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={uploading ? 'Uploading...' : placeholder}
          disabled={disabled || uploading}
          className="flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            borderColor: teamColors.primary,
            backgroundColor: '#fff',
            color: '#000'
          }}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className="hidden"
          disabled={disabled || uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="px-3 py-2 rounded font-medium hover:opacity-80 disabled:opacity-50"
          style={{
            backgroundColor: teamColors.primary,
            color: primaryBgText
          }}
          title="Select file"
        >
          {uploading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    )
  }

  // Full layout with preview and all options
  return (
    <div className="space-y-3">
      {/* Preview */}
      {showPreview && value && (
        <div className="flex justify-center">
          <div className="relative">
            <img
              src={value}
              alt="Preview"
              className="w-24 h-24 object-cover rounded-lg border-2"
              style={{ borderColor: teamColors.primary }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                title="Remove image"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drop zone / Paste area */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragOver ? 'border-blue-500 bg-blue-50' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{
          borderColor: dragOver ? '#3b82f6' : `${teamColors.primary}50`,
          backgroundColor: dragOver ? '#eff6ff' : 'transparent'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        onPaste={handlePaste}
        tabIndex={0}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 animate-spin" style={{ color: teamColors.primary }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium" style={{ color: secondaryBgText }}>Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8" style={{ color: teamColors.primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-sm" style={{ color: secondaryBgText }}>
              <span className="font-medium">Click to select</span>, drag & drop, or <span className="font-medium">paste (Ctrl+V)</span>
            </div>
            <span className="text-xs" style={{ color: secondaryBgText, opacity: 0.6 }}>
              Supports JPG, PNG, GIF up to 32MB
            </span>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Mobile paste button */}
      <button
        type="button"
        onClick={handleClipboardPaste}
        disabled={disabled || uploading}
        className="w-full py-2 px-4 rounded-lg border-2 font-medium hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          borderColor: teamColors.primary,
          color: teamColors.primary,
          backgroundColor: 'transparent'
        }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Paste from Clipboard
      </button>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="Or enter image URL directly..."
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2 text-sm"
          style={{
            borderColor: `${teamColors.primary}50`,
            backgroundColor: '#fff',
            color: '#000'
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-2 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
