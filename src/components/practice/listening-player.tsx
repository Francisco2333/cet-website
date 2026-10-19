"use client";

import { useRef, useState } from "react";
import { Headphones } from "lucide-react";

export function ListeningPlayer({ src }: { src?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);
  return <section className="audio-strip" aria-label="听力播放器">
    <div className="flex items-center gap-2 text-sm shrink-0"><Headphones size={18} className="text-primary" /><span className="font-medium">听力</span></div>
    {src ? <>
      <audio ref={ref} aria-label="试卷听力" src={src} controls preload="metadata" onError={() => setError(true)} onCanPlay={() => setError(false)} className="min-w-0 w-full h-10">浏览器不支持音频，请下载 MP3。</audio>
      {error ? <div className="text-xs text-danger shrink-0 max-w-64" role="status">音频加载失败。<button className="underline" onClick={() => { setError(false); ref.current?.load(); }}>重试</button> 或 <a className="underline" href={src} download>下载 MP3</a></div> : <span className="text-xs text-muted shrink-0">点击播放后开始听力，可同时作答</span>}
    </> : <p className="text-sm text-muted">此卷未收录听力音频，仍可预览和作答。</p>}
  </section>;
}
