// Input de teléfono reutilizable: prefijo fijo +56 (Chile) + 9 dígitos.
// `value`/`onChange` manejan solo el número nacional (9 dígitos, sin +56).
export default function PhoneInput({
  value,
  onChange,
  label = 'Teléfono',
  required = false,
  error,
  variant = 'dark',
  placeholder = '9 1234 5678',
  className = '',
}) {
  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    onChange(digits);
  };

  const styles = variant === 'dark'
    ? {
        label: 'text-slate-400',
        wrapper: 'bg-slate-950/60 border-slate-800 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
        flag: 'border-slate-800 text-slate-300',
        input: 'text-white placeholder-slate-600',
      }
    : variant === 'glass'
    ? {
        label: 'text-blue-200',
        wrapper: 'bg-white/10 border-white/20 focus-within:border-blue-400 focus-within:bg-white/15',
        flag: 'border-white/20 text-white/80',
        input: 'text-white placeholder-white/40',
      }
    : {
        label: 'text-slate-500',
        wrapper: 'bg-white border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
        flag: 'border-slate-200 text-slate-600 bg-slate-50',
        input: 'text-slate-900 placeholder-slate-400',
      };

  return (
    <div className={className}>
      {label && (
        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${styles.label}`}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className={`flex items-stretch rounded-xl border overflow-hidden transition-all ${styles.wrapper} ${error ? 'border-red-500/60' : ''}`}>
        <div className={`flex items-center gap-1.5 px-3 border-r text-sm font-semibold shrink-0 ${styles.flag}`}>
          <span>🇨🇱</span>
          <span>+56</span>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={9}
          className={`flex-1 min-w-0 px-3 py-2.5 bg-transparent focus:outline-none text-sm ${styles.input}`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-400 font-medium">{error}</p>}
    </div>
  );
}
