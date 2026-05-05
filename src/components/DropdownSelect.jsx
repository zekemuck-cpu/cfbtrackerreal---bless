import { useState, useRef, useEffect } from 'react'

export default function DropdownSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  label,
  required = false,
  teamColors = { primary: '#1f2937', secondary: '#ffffff' }
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const optionRefs = useRef([])

  const filteredOptions = options.filter(opt => {
    const optionLabel = typeof opt === 'string' ? opt : opt.label
    return optionLabel.toLowerCase().includes(searchTerm.toLowerCase())
  })

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchTerm])

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    }
  }, [highlightedIndex, isOpen])

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value)
    setIsOpen(true)
  }

  const handleOptionClick = (option) => {
    const optionValue = typeof option === 'string' ? option : option.value
    onChange(optionValue)
    setSearchTerm('')
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  const handleInputBlur = (e) => {
    // Use a small timeout to allow click events on options to fire first
    setTimeout(() => {
      // Check if the new focused element is within the dropdown
      if (dropdownRef.current && !dropdownRef.current.contains(document.activeElement)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }, 150)
  }

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredOptions[highlightedIndex]) {
          handleOptionClick(filteredOptions[highlightedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearchTerm('')
        inputRef.current?.blur()
        break
      default:
        break
    }
  }

  // Get display value
  const getDisplayValue = () => {
    if (searchTerm) return searchTerm
    if (!value) return ''
    const option = options.find(opt =>
      typeof opt === 'string' ? opt === value : opt.value === value
    )
    if (!option) return value
    return typeof option === 'string' ? option : option.label
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={getDisplayValue()}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors placeholder-gray-500"
          style={{
            borderColor: '#374151',
            color: '#f3f4f6',
            backgroundColor: '#1f2937'
          }}
          autoComplete="off"
          required={required}
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            style={{ color: '#9ca3af' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div
          className="absolute z-10 w-full mt-1 rounded-lg shadow-lg max-h-60 overflow-auto"
          style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
        >
          {filteredOptions.map((option, index) => {
            const optionValue = typeof option === 'string' ? option : option.value
            const optionLabel = typeof option === 'string' ? option : option.label
            const isHighlighted = index === highlightedIndex
            const isSelected = value === optionValue

            return (
              <div
                key={optionValue}
                ref={(el) => (optionRefs.current[index] = el)}
                onClick={() => handleOptionClick(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className="px-4 py-2.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: isHighlighted ? 'var(--surface-4)' : isSelected ? 'var(--surface-3)' : 'transparent',
                  color: '#f3f4f6'
                }}
              >
                <span className={isSelected ? 'font-medium' : ''}>
                  {optionLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {isOpen && searchTerm && filteredOptions.length === 0 && (
        <div
          className="absolute z-10 w-full mt-1 rounded-lg shadow-lg p-4 text-center"
          style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }}
        >
          No options found matching "{searchTerm}"
        </div>
      )}
    </div>
  )
}
