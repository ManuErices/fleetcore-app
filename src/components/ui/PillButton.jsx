import React from 'react';

export function PillButton({
  onClick,
  title,
  children,
  disabled = false,
  isLoading = false,
  loadingText,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'outline' | 'small'
  className = '',
  type = 'button',
  icon,
}) {
  // Use flex-wrap and responsive sizes. Replace fixed height with py/min-h to allow vertical expansion if text wraps.
  const baseClasses = "flex items-center justify-center gap-2 font-black uppercase tracking-wider rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none select-none w-full sm:w-auto text-center";

  let sizeClasses = "min-h-[3.5rem] py-3.5 px-5 text-xs sm:text-sm md:text-base leading-tight";
  if (variant === 'small') {
    sizeClasses = "min-h-[2.75rem] py-2 px-3 text-[11px] sm:text-xs leading-tight";
  }

  let variantClasses = "";
  switch (variant) {
    case 'primary':
      variantClasses = "bg-blue-900 hover:bg-blue-800 text-white shadow-blue-100 hover:shadow-lg";
      break;
    case 'secondary':
      variantClasses = "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-100 hover:shadow-lg";
      break;
    case 'danger':
      variantClasses = "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-100 hover:shadow-lg";
      break;
    case 'outline':
      variantClasses = "bg-transparent border-2 border-slate-300 hover:bg-slate-50 text-slate-700 shadow-none";
      break;
    default:
      variantClasses = "bg-blue-900 hover:bg-blue-800 text-white shadow-blue-100";
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-black truncate">{loadingText || "Cargando..."}</span>
        </>
      ) : (
        <span className="flex items-center justify-center gap-1.5 flex-wrap">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span className="font-black">{title || children}</span>
        </span>
      )}
    </button>
  );
}
