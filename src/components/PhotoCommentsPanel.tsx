import { useState } from 'react';

type PhotoCommentsPanelProps = {
  className?: string;
};

const PhotoCommentsPanel = ({ className = '' }: PhotoCommentsPanelProps) => {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');

  const handleSend = () => {
    setDraft('');
    setStatus('Comments are not enabled yet.');
  };

  return (
    <section
      className={`flex min-h-[260px] flex-col border-t border-white/[0.07] ${className}`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <h3 className="text-sm font-semibold text-stone-100">Comments</h3>
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#17120f]/55 px-4 py-5 text-sm text-stone-400">
          No comments yet.
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.07] p-4">
        <div className="flex items-center gap-2 rounded-full bg-[#15110e] p-1.5 ring-1 ring-white/[0.08]">
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setStatus('');
            }}
            placeholder="Say something..."
            className="min-w-0 flex-1 bg-transparent px-3 text-sm text-stone-200 outline-none placeholder:text-stone-500"
          />
          <button
            type="button"
            onClick={handleSend}
            className="rounded-full bg-[#9db6b0] px-4 py-2 text-xs font-semibold text-[#17110e] transition hover:bg-[#b7cec8]"
          >
            Send
          </button>
        </div>
        {status ? (
          <p className="mt-2 text-xs text-stone-400">{status}</p>
        ) : null}
      </div>
    </section>
  );
};

export { PhotoCommentsPanel };
