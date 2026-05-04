import CombustibleForm from './CombustibleForm';

export default function CombustibleModal({ isOpen, onClose, empresaId }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <CombustibleForm empresaId={empresaId} onClose={onClose} />
    </div>
  );
}
