import { useState } from 'react';
import { useKeystroke } from '../hooks/useKeystroke.js';

/**
 * Type a fixed phrase naturally. Backspace restarts the attempt so the rhythm stays clean.
 * onComplete(events) fires with [{k,d,u}] once the phrase is typed exactly.
 */
export default function TypingChallenge({ phrase, onComplete, disabled, autoFocus }) {
  const ks = useKeystroke();
  const [value, setValue] = useState('');
  const [hint, setHint] = useState('');

  const handleChange = (e) => {
    const v = e.target.value;
    if (!phrase.startsWith(v)) { setHint('That key does not match. Start over and type it again.'); setValue(''); ks.reset(); return; }
    setHint('');
    setValue(v);
    if (v === phrase) {
      setTimeout(() => {
        const ev = ks.take();
        if (ev.length === phrase.length) onComplete(ev);
        else { setHint('Type the phrase without holding keys or using shortcuts.'); ks.reset(); }
        setValue('');
      }, 160);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') { e.preventDefault(); setValue(''); ks.reset(); setHint('Restarted. Type the phrase from the beginning.'); return; }
    ks.onKeyDown(e);
  };

  return (
    <div>
      <p className="mb-2 select-none rounded-lg bg-bg px-4 py-3 text-center font-mono text-base tracking-wide">
        <span className="text-face">{value}</span>
        <span className="text-mute">{phrase.slice(value.length)}</span>
      </p>
      <input
        className="input text-center" value={value} disabled={disabled} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
        placeholder="Type the phrase above" onChange={handleChange} onKeyDown={handleKeyDown} onKeyUp={ks.onKeyUp}
        onPaste={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()} aria-label="Typing challenge"
      />
      <p className="mt-1.5 h-4 text-xs text-mute" aria-live="polite">{hint}</p>
    </div>
  );
}
