import { useEffect } from 'react';
import CombustibleForm from './CombustibleForm';

export default function CombustibleModal({ isOpen, onClose, empresaId, isReportesView }) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <CombustibleForm empresaId={empresaId} onClose={onClose} isReportesView={isReportesView} />
      </div>
    </div>
  );
}
