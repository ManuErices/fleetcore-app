import CombustibleForm from './combustible/CombustibleForm';

export default function CombustibleModal({ isOpen, onClose, empresaId }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 overflow-y-auto overscroll-contain">
      <div className="min-h-full flex items-center justify-center p-4">
        <CombustibleForm empresaId={empresaId} onClose={onClose} />
      </div>
    </div>
  );
}
