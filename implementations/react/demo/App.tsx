// Demo: an "existing" mini music app. Glass is layered on without changing its state logic.
import React, { useEffect, useRef, useState } from 'react';
import {
  LiquidGlassProvider, GlassButton, GlassGroup, GroupButton, GlassMenu, FloatingTabBar, FloatingPanel,
  SegmentedControl, GlassSlider, GlassToggle, ScrollEdge, GlassSurface, useGlassAudit, liquidGlassRefraction,
} from '../src';

const Icon = { back: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>,
  lib: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v4H5zM5 10h14v4H5zM5 16h14v4H5z" /></svg>,
  prev: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg> };

export function App() {
  // ---- existing app state (unchanged by glass adoption) ----
  const [tab, setTab] = useState<'home' | 'browse' | 'library'>('home');
  const [section, setSection] = useState<'foryou' | 'library' | 'browse'>('foryou');
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(60);
  const [crossfade, setCrossfade] = useState(true);
  const [panel, setPanel] = useState(false);
  const [log, setLog] = useState('');
  const [dark, setDark] = useState(false);
  const [rt, setRt] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLCanvasElement>(null);
  const [artReady, setArtReady] = useState(false);
  // draw the artwork into a canvas so v2 glass can refract real pixels
  useEffect(() => {
    const c = art.current; if (!c) return;
    const draw = () => {
      const r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const x = c.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = x.createLinearGradient(r.width * 0.3, 0, r.width * 0.7, r.height);
      [['#ff8a3d', 0], ['#ff5e7e', 0.4], ['#7a4cff', 0.75], ['#1d2b8f', 1]].forEach(([col, o]) => g.addColorStop(o as number, col as string));
      x.fillStyle = g; x.fillRect(0, 0, r.width, r.height);
      x.fillStyle = '#ffe26a'; x.beginPath(); x.arc(r.width * 0.75, r.height * 0.22, 60, 0, 7); x.fill();
      x.fillStyle = '#19224f'; x.beginPath(); x.ellipse(r.width * 0.3, r.height + 40, r.width * 0.72, 170, 0, Math.PI, 0); x.fill();
      liquidGlassRefraction.invalidate(c);
    };
    draw(); setArtReady(true);
    const ro = new ResizeObserver(draw); ro.observe(c); return () => ro.disconnect();
  }, []);
  useGlassAudit([panel, tab]);

  return (
    <LiquidGlassProvider scheme={dark ? 'dark' : undefined} overrides={{ reduceTransparency: rt }}>
      <style>{css}</style>
      <main className="phone" aria-label="React demo device" data-lg-portal="">
        <div className="screen" ref={screen}>
          <section className="hero" aria-label="Now playing">
            <canvas ref={art} className="art" aria-hidden="true" />
            <div className="meta"><h2>Golden Hour</h2><p>Lab Sessions</p></div>
            <div className="media-wrap lg-dim lg-dim--local" data-lg-layer="control">
              <GlassGroup variant="clear" aria-label="Playback" className="media" data-testid="media"
                refraction={artReady ? { backdrop: art, shape: { type: 'capsule' }, preset: 'media' } : undefined}>
                <GroupButton aria-label="Previous track" icon={Icon.prev} onClick={() => setLog('prev')} />
                <GroupButton aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} icon={playing ? Icon.pause : Icon.play} onClick={() => setPlaying((p) => !p)} data-testid="play" />
                <GroupButton aria-label="Next track" icon={Icon.next} onClick={() => setLog('next')} />
              </GlassGroup>
            </div>
          </section>
          <SegmentedControl appearance="content" aria-label="Section" value={section} onChange={setSection}
            options={[{ value: 'foryou', label: 'For You' }, { value: 'library', label: 'Library' }, { value: 'browse', label: 'Browse' }]} />
          <div className="settings">
            <div className="row"><span id="vol">Volume {volume}</span><GlassSlider aria-labelledby="vol" value={volume} onChange={setVolume} /></div>
            <div className="row"><span id="cf">Crossfade</span><GlassToggle aria-labelledby="cf" checked={crossfade} onChange={setCrossfade} /></div>
            <div className="row"><span id="dk">Dark glass</span><GlassToggle aria-labelledby="dk" checked={dark} onChange={setDark} /></div>
            <div className="row"><span id="rt">Reduce transparency</span><GlassToggle aria-labelledby="rt" checked={rt} onChange={setRt} /></div>
          </div>
          <p><button className="filled" onClick={() => setPanel(true)} data-testid="open-panel">Sleep timer…</button></p>
          {Array.from({ length: 12 }, (_, i) => <p key={i} className="item"><strong>Track {i + 1}</strong>Artist · 3:{10 + i}</p>)}
          <p role="status" data-testid="log">{log}</p>
        </div>
        <ScrollEdge edge="top" /><ScrollEdge edge="bottom" />
        <header className="topbar" data-lg-layer="navigation">
          <GlassButton aria-label="Back" icon={Icon.back} onClick={() => setLog('back')} />
          <h1>Listen Now</h1>
          <div className="end">
            <GlassButton prominent aria-label="Add to library" icon={Icon.plus} onClick={() => setLog('added')} />
            <GlassGroup aria-label="Page actions">
              <GlassMenu label="More options" items={[
                { label: 'Share', onSelect: () => setLog('share') },
                { label: 'Show album', onSelect: () => setLog('album') },
                { label: 'Remove', destructive: true, separatorBefore: true, onSelect: () => setLog('removed') },
              ]} trigger={(p) => <GroupButton {...p} aria-label="More options" icon={Icon.more} data-testid="more" />} />
            </GlassGroup>
          </div>
        </header>
        <div className="tabbar-wrap">
          <FloatingTabBar barRef={bar} aria-label="Tabs" value={tab} onChange={setTab} scrollRef={screen} onSearch={() => setLog('search')}
            options={[{ value: 'home', label: 'Home', icon: Icon.home }, { value: 'browse', label: 'Browse', icon: Icon.grid }, { value: 'library', label: 'Library', icon: Icon.lib }]} />
        </div>
        <FloatingPanel open={panel} onClose={() => setPanel(false)} title="Sleep timer" hideWhileOpen={[bar]} className="panel" data-testid="panel">
          <p>Overlay layer. Materializes with a lensing ramp.</p>
        </FloatingPanel>
      </main>
      <GlassSurface style={{ display: 'none' }} />
    </LiquidGlassProvider>
  );
}

const css = `
*{box-sizing:border-box} body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f16;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.phone{position:relative;width:390px;height:844px;border-radius:54px;overflow:hidden;background:#f2f2f7;color:#0b0b0f;box-shadow:0 0 0 10px #1b1c22}
[data-lg-scheme=dark] .phone{background:#000;color:#f5f5f7}
.screen{position:absolute;inset:0;overflow:auto;padding:112px 16px 120px;scrollbar-width:none}
.hero{position:relative;height:380px;border-radius:34px;overflow:hidden;margin-bottom:16px;background:radial-gradient(150px 150px at 75% 22%,#ffe26a 0 40%,transparent 41%),linear-gradient(160deg,#ff8a3d,#ff5e7e 40%,#7a4cff 75%,#1d2b8f)}
.art{position:absolute;inset:0;width:100%;height:100%}.meta{position:absolute;z-index:1;left:20px;top:18px;color:#fff}.meta h2{margin:0}.meta p{margin:0;font-weight:600}
.media-wrap{position:absolute;z-index:2;left:50%;bottom:22px;transform:translateX(-50%);border-radius:999px}
.media{padding:6px}.media .lg-btn svg{width:26px;height:26px}
.settings{margin:16px 0;padding:6px 16px;border-radius:26px;background:#fff}[data-lg-scheme=dark] .settings{background:#1c1c1e}
.row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:52px}.row .lg-slider{flex:1}
.filled{border:0;border-radius:999px;background:#0a6ad0;color:#fff;font:600 15px system-ui;min-height:44px;padding:0 18px}
.item{margin:0;padding:12px 4px;border-bottom:.5px solid rgba(128,128,128,.3)}.item strong{display:block}
.topbar{position:absolute;z-index:10;top:54px;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between}
.topbar h1{position:absolute;left:50%;transform:translateX(-50%);margin:0;font-size:17px}.end{display:flex;gap:8px}
.tabbar-wrap{position:absolute;z-index:10;left:16px;right:16px;bottom:28px}
.panel{position:absolute;z-index:25;left:10px;right:10px;bottom:10px}
.lg-menu{z-index:30}
`;
