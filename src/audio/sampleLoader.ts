const cache = new Map<string, Promise<AudioBuffer | null>>();

// Returns null (rather than throwing) when a sample file hasn't been
// provided yet, so the engine can fall back to a synthesized placeholder.
export function loadSample(ctx: BaseAudioContext, sampleFile: string): Promise<AudioBuffer | null> {
  const key = `${ctx.sampleRate}:${sampleFile}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(`/samples/${sampleFile}`)
      .then((res) => {
        if (!res.ok) throw new Error(`missing sample: ${sampleFile}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    cache.set(key, pending);
  }
  return pending;
}
