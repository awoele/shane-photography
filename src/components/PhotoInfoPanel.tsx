import { useEffect, useState } from 'react';

import { getPhotoPanelFields, type Photo } from '@/lib/photos';

type PhotoInfoPanelProps = {
  photo: Photo;
  className?: string;
  showPrivateNote?: boolean;
};

type ArchiveFieldProps = {
  label: string;
  value: string;
};

const NOTE_PREFIX = 'shane-photo-note:';

const ArchiveField = ({ label, value }: ArchiveFieldProps) => (
  <section className="space-y-2">
    <h3 className="text-[11px] font-medium uppercase tracking-[0.24em] text-stone-500">
      {label}
    </h3>
    <p className="break-words text-base leading-7 text-stone-100">{value}</p>
  </section>
);

const PhotoInfoPanel = ({
  photo,
  className = '',
  showPrivateNote = false,
}: PhotoInfoPanelProps) => {
  const [noteDraft, setNoteDraft] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const noteKey = `${NOTE_PREFIX}${photo.id}`;
  const fields = getPhotoPanelFields(photo);

  const handleSaveNote = () => {
    try {
      const nextValue = noteDraft.trim();

      if (nextValue) {
        window.localStorage.setItem(noteKey, nextValue);
        setNoteDraft(nextValue);
        setNoteStatus('Saved');
      } else {
        window.localStorage.removeItem(noteKey);
        setNoteDraft('');
        setNoteStatus('Cleared');
      }
    } catch {
      setNoteStatus('Not saved');
    }
  };

  useEffect(() => {
    if (!showPrivateNote) {
      return;
    }

    try {
      setNoteDraft(window.localStorage.getItem(noteKey) ?? '');
    } catch {
      setNoteDraft('');
    }

    setNoteStatus('');
  }, [noteKey, showPrivateNote]);

  return (
    <div className={`space-y-7 ${className}`}>
      {fields.map((field) => (
        <ArchiveField
          key={field.label}
          label={field.label}
          value={field.value}
        />
      ))}

      {photo.description ? (
        <ArchiveField label="DESCRIPTION" value={photo.description} />
      ) : null}

      {showPrivateNote ? (
        <section className="border-t border-white/[0.07] pt-7">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.24em] text-stone-500">
            PRIVATE NOTE
          </h3>
          <textarea
            value={noteDraft}
            onChange={(event) => {
              setNoteDraft(event.target.value);
              setNoteStatus('');
            }}
            rows={5}
            placeholder="Write a private thought about this photo..."
            className="mt-3 w-full resize-none rounded-2xl border border-white/[0.08] bg-[#16120f] px-4 py-3 text-sm leading-6 text-stone-200 outline-none transition placeholder:text-stone-600 focus:border-[#9db6b0]/70"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">{noteStatus}</p>
            <button
              type="button"
              onClick={handleSaveNote}
              className="rounded-full bg-[#9db6b0] px-4 py-2 text-xs font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
            >
              Save
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export { PhotoInfoPanel };
