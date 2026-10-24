import { Camera, Loader2 } from 'lucide-react';

/** Mirrored camera view with a scan overlay. Pass the object returned by useFace(). */
export default function WebcamPanel({ face, overlay, compact = false, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-black ${compact ? 'aspect-[4/3]' : 'aspect-[4/3]'} ${className}`}>
      <video ref={face.videoRef} playsInline muted className="mirror h-full w-full object-cover" />
      {face.state === 'ready' && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[68%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/60" />
          <div className="scanline absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-face/25 to-transparent" />
        </div>
      )}
      {face.state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/95 p-4 text-center">
          {face.state === 'loading' ? <Loader2 className="animate-spin text-face" /> : <Camera className="text-mute" />}
          <p className="text-sm text-mute">
            {face.state === 'loading' ? 'Loading face models and camera...' : face.state === 'error' ? face.error : 'Camera is off'}
          </p>
          {face.state !== 'loading' && <button className="btn-primary" onClick={face.start}>{face.state === 'error' ? 'Try again' : 'Turn on camera'}</button>}
        </div>
      )}
      {overlay && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-center text-sm font-medium text-white">{overlay}</div>}
    </div>
  );
}
