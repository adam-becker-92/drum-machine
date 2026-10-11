import { readShareHash } from './io/shareLink';
import { useClipLibrary } from './state/clipLibrary';
import { enableMidi, useMidiStore } from './state/midiInput';
import { useProjectStore } from './state/projectStore';
import { showToast } from './state/toastStore';

// Runs once before the first render: reconnect MIDI if it was on last time,
// and open a shared project or clip from the link (then tidy the link so a
// reload doesn't import it again).
export function startup() {
  if (useMidiStore.getState().wanted) void enableMidi();

  const { hash, pathname, search } = window.location;
  if (!hash) return;
  const shared = readShareHash(hash);
  window.history.replaceState(null, '', pathname + search);
  if (shared?.kind === 'project') {
    useProjectStore.getState().loadProject(shared.project);
    showToast('Opened a shared project. It has its own save slot, so your own project is untouched.');
  } else if (shared?.kind === 'clip') {
    useClipLibrary.getState().saveClip(shared.shared.name, shared.shared.clip);
    showToast(`Added “${shared.shared.name}” to your clip library: open an instrument, then Clip ▾ → Clip library.`);
  }
}
