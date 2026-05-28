import React, { useState, useRef, useEffect } from 'react';

export default function SearchableDropdown({ value, onChange, placeholder, options = [], renderItem }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions = options.filter(opt => {
    const text = renderItem ? renderItem(opt) : opt;
    if (!text) return false;
    return text.toString().toLowerCase().includes((value || '').toLowerCase());
  });

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
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
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden">
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
                      // prevent input blur
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
        </div>
      )}
    </div>
  );
}
