import { useState, useRef, useEffect } from 'react'
import { getConferenceLogo, conferences } from '../data/conferenceLogos'
import { getContrastTextColor } from '../utils/colorUtils'

export default function ConferenceSelect({
  value,
  onChange,
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

  const textColor = getContrastTextColor(teamColors.secondary)

  const filteredConferences = conferences.filter(conf =>
    conf.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  // Scroll highlighted option into view when navigating with keyboard
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
    onChange(option)
    setSearchTerm('')
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    setIsOpen(true)
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
          prev < filteredConferences.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredConferences[highlightedIndex]) {
          handleOptionClick(filteredConferences[highlightedIndex])
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

  const displayValue = value || searchTerm

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label
          className="block text-sm font-medium mb-2"
          style={{ color: teamColors.primary }}
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {value && getConferenceLogo(value) && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <img
              src={getConferenceLogo(value)}
              alt={`${value} logo`}
              className="w-6 h-6 object-contain"
            />
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search conferences..."
          className="w-full py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors placeholder-gray-500"
          style={{
            borderColor: '#374151',
            paddingLeft: value && getConferenceLogo(value) ? '2.75rem' : '1rem',
            paddingRight: '2.75rem',
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

      {isOpen && filteredConferences.length > 0 && (
        <div
          className="absolute z-10 w-full mt-1 rounded-lg shadow-lg max-h-60 overflow-auto"
          style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
        >
          {filteredConferences.map((conference, index) => {
            const logoUrl = getConferenceLogo(conference)
            const isHighlighted = index === highlightedIndex
            const isSelected = value === conference

            return (
              <div
                key={conference}
                ref={(el) => (optionRefs.current[index] = el)}
                onClick={() => handleOptionClick(conference)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className="px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-3"
                style={{
                  backgroundColor: isHighlighted ? teamColors.primary : isSelected ? `${teamColors.primary}30` : 'transparent',
                  color: isHighlighted ? teamColors.secondary : '#f3f4f6'
                }}
              >
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt={`${conference} logo`}
                    className="w-8 h-8 object-contain"
                  />
                )}
                <span className={isSelected ? 'font-medium' : ''}>
                  {conference}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {isOpen && searchTerm && filteredConferences.length === 0 && (
        <div
          className="absolute z-10 w-full mt-1 rounded-lg shadow-lg p-4 text-center"
          style={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }}
        >
          No conferences found matching "{searchTerm}"
        </div>
      )}
    </div>
  )
}
