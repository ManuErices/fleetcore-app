import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function SearchableDropdown({ value, onChange, placeholder, options = [], renderItem }) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  const computePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    computePosition();

    const handleScroll = (e) => {
      // Ignorar scroll dentro del propio dropdown
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      computePosition();
    };

    const handleClickOutside = (e) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', computePosition);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', computePosition);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, computePosition]);

  const filteredOptions = options.filter(opt => {
    const text = renderItem ? renderItem(opt) : opt;
    if (!text) return false;
    return text.toString().toLowerCase().includes((value || '').toLowerCase());
  });

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-blue-500 font-medium text-sm text-slate-700 outline-none transition-colors"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && createPortal(
        <div ref={dropdownRef} style={dropdownStyle} className="bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, i) => {
                const text = renderItem ? renderItem(opt) : opt;
                if (!text) return null;
                return (
                  <div
                    key={i}
                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm font-medium text-slate-700 border-b border-slate-50 last:border-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(text);
                      setOpen(false);
                    }}
                  >
                    {text}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-3 text-sm text-slate-500 text-center font-medium">No se encontraron resultados</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
