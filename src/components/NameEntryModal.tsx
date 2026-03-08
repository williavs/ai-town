import { useState } from 'react';
import ReactModal from 'react-modal';
import { validateName } from '../hooks/usePlayerName';

const NAME_MAX_LENGTH = 16;

export default function NameEntryModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const validationError = validateName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSubmit(name.trim());
    setName('');
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel="Enter Your Name"
      ariaHideApp={false}
      style={{
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        content: {
          position: 'relative',
          inset: 'auto',
          border: 'none',
          background: '#3c2a1a',
          padding: '2rem',
          borderRadius: '0.5rem',
          maxWidth: '400px',
          width: '90%',
          color: 'white',
          fontFamily: 'inherit',
        },
      }}
    >
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        Enter Your Name
      </h2>
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        maxLength={NAME_MAX_LENGTH}
        placeholder="Your name..."
        autoFocus
        style={{
          width: '100%',
          padding: '0.75rem',
          fontSize: '1rem',
          borderRadius: '0.25rem',
          border: error ? '2px solid #e74c3c' : '2px solid #8b7355',
          background: '#2a1a0a',
          color: 'white',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.8rem',
        }}
      >
        <span style={{ color: error ? '#e74c3c' : 'transparent' }}>{error || 'x'}</span>
        <span style={{ color: '#8b7355' }}>
          {name.length}/{NAME_MAX_LENGTH}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '1rem',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1.5rem',
            background: 'transparent',
            border: '2px solid #8b7355',
            color: '#8b7355',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '0.5rem 1.5rem',
            background: '#8b7355',
            border: '2px solid #8b7355',
            color: 'white',
            borderRadius: '0.25rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Join
        </button>
      </div>
    </ReactModal>
  );
}
