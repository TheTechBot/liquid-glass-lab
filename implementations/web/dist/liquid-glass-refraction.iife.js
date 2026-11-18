(function(){
/*
 * Liquid Glass Lab — WebGL2 refraction engine (v2).
 *
 * A physically INSPIRED UI material model. It is not Apple's renderer and makes no claim to match it.
 *
 * Per pixel inside a glass shape:
 *   1. Signed distance to the shape boundary (analytic for rect / rounded rect / circle / ellipse / capsule,
 *      CPU-built distance-field texture for SVG paths and polygons).
 *   2. A convex bevel height profile of width `curvature × min(halfWidth, halfHeight)` and height `thickness`.
 *      Surface normal = gradient of that height field (smooth across rounded corners).
 *   3. Snell refraction of the view ray with index `ior`; the ray travels `thickness` to the backdrop plane.
 *      The resulting offset (× `refraction`) shifts the BACKDROP texture lookup — the real backdrop pixels move.
 *   4. Optional frosted blur (12-tap disk), dispersion, Schlick Fresnel reflection, light-facing rim highlight,
 *      subtle internal reflection, tint, drop shadow, 1-device-pixel antialiased edge.
 * No noise or turbulence is used anywhere.
 *
 * Limitation: WebGL cannot read DOM pixels. The backdrop must be drawable: <canvas>, <img> or <video>.
 * For DOM backdrops use the v1 SVG path (liquid-glass.js → LG.refract) or blur. See attach() `backdrop`.
 *
 * API
 *   const engine = LGRefraction.engine();            // shared singleton, or null if WebGL2 unavailable
 *   const glass  = LGRefraction.attach(el, {
 *     backdrop: canvasOrImgOrVideo,                    // required for WebGL
 *     dynamic: true,                                   // re-upload backdrop every frame (video / animated canvas)
 *     shape: { type: 'roundedRect', radius: 24 }      // 'rect' | 'roundedRect' | 'circle' | 'ellipse' | 'capsule'
 *          | { type: 'path', d: 'M…', viewBox: [0,0,100,100] } | { type: 'polygon', points: [[x,y],…] } (0..1),
 *     material: { ior, thickness, curvature, refraction, edge, fresnel, blur, tint, reflection, dispersion, shadow },
 *   });
 *   glass.update({ material: { ior: 1.6 } }); glass.destroy();
 *   LGRefraction.disableAll() / enableAll()           // runtime rollback to v1
 */

/**
 * SIGNATURE — the user's chosen sweet spot (Refraction Test Lab, v2 tuned 2026-11-18; v1 was 2026-11-17).
 * This is the default for every shape and every component. Change it only when the user asks.
 */
const SIGNATURE = Object.freeze({
  profile: 'rim',    // 'rim' (signature look) | 'physical' (Snell through a circular bevel)
  ior: 1.51,         // effective refractive index
  thickness: 31,     // CSS px. rim: peak pull at the edge = thickness·(ior−1)·2·refraction ≈ 32 px
  curvature: 0.25,   // bend band width as a fraction of the shorter half-size (narrow rim)
  refraction: 1,     // global multiplier on the offset
  edge: 0.81,        // rim highlight intensity
  fresnel: 0.92,     // Fresnel reflection weight
  blur: 2.5,         // CSS px frosted blur AFTER bending
  tint: 'rgba(255,255,255,0.11)',
  reflection: 0.41,  // internal reflection weight
  dispersion: 0.015, // chromatic split
  shadow: 0.25,      // drop shadow opacity
  lightAngle: 50,    // degrees; direction light comes FROM (50 = lower right)
  maxOffset: 0.9,    // clamp offset to this fraction of the shorter half-size
});
const DEFAULT_MATERIAL = SIGNATURE;

/**
 * Presets keep the signature BEND (profile, ior, thickness, curvature) and only change legibility layers,
 * so every surface in a UI reads as the same glass.
 */
const PRESETS = Object.freeze({
  signature: SIGNATURE,
  control: Object.freeze({ ...SIGNATURE, tint: 'rgba(255,255,255,0.16)' }),               // buttons, toolbars, tab bars with icons/labels
  media: Object.freeze({ ...SIGNATURE, tint: 'rgba(0,0,0,0.28)' }),                        // controls over photos/video (HIG dimming idea)
  overlay: Object.freeze({ ...SIGNATURE, blur: 8, tint: 'rgba(250,250,252,0.55)' }),       // menus, sheets, panels with body text
  'overlay-dark': Object.freeze({ ...SIGNATURE, blur: 8, tint: 'rgba(28,28,32,0.55)' }),
});

const SHAPES = { rect: 0, roundedRect: 1, circle: 2, ellipse: 3, capsule: 4, path: 5, polygon: 5, union: 5 };
const PAD = 28; // CSS px around the shape for shadow + antialiasing

// ---------------------------------------------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------------------------------------------
const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uSize;      // shape box, css px
uniform float uPad;      // css px
uniform float uDpr;
uniform int uShape;
uniform float uRadius;
uniform sampler2D uSdf;  // R = true sdf (css px), G = smoothed sdf for normals
uniform sampler2D uBg;
uniform vec2 uBgUv0;     // backdrop uv of shape box top-left
uniform vec2 uBgUvPx;    // backdrop uv per css px
uniform float uHmin;
uniform float uIor, uThick, uCurv, uStrength, uEdge, uFresnel, uBlur, uReflect, uDisp, uShadow, uMaxOff;
uniform vec4 uTint;
uniform vec2 uLight;     // unit vector the light comes FROM (screen space, y down)
uniform int uDebug;      // 0 final, 1 normals, 2 offset, 3 sdf bands
uniform int uProfile;    // 0 rim lens (default), 1 physical bevel

float sdRoundBox(vec2 p, vec2 h, float r){ r=min(r,min(h.x,h.y)); vec2 q=abs(p)-h+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float sdEllipse(vec2 p, vec2 ab){ float k0=length(p/ab); float k1=length(p/(ab*ab)); return k1<1e-5 ? -min(ab.x,ab.y) : k0*(k0-1.)/k1; }

// true boundary distance (alpha, shadow)
float sdTrue(vec2 p){
  vec2 h=uSize*0.5;
  if(uShape==0) return sdRoundBox(p,h,0.);
  if(uShape==1) return sdRoundBox(p,h,uRadius);
  if(uShape==2) return length(p)-min(h.x,h.y);
  if(uShape==3) return sdEllipse(p,h);
  if(uShape==4) return sdRoundBox(p,h,min(h.x,h.y));
  vec2 uv=clamp((p+h)/uSize,0.,1.);
  return texture(uSdf,uv).r + length(max(abs(p)-h,0.));
}
// field used for the bevel: same boundary on smooth shapes; corner radius inflated to the bevel width on
// box shapes so inner contours never form a crease along the corner diagonal (acceptance D).
float sdBevel(vec2 p, float W){
  vec2 h=uSize*0.5;
  if(uShape==0 || uShape==1) return sdRoundBox(p,h,max(uRadius*float(uShape),W));
  if(uShape==5){ vec2 uv=clamp((p+h)/uSize,0.,1.); return texture(uSdf,uv).g + length(max(abs(p)-h,0.)); }
  return sdTrue(p);
}

vec3 bg(vec2 uv){ return texture(uBg,uv).rgb; }
vec3 bgBlur(vec2 uv, float rPx){
  if(rPx<0.5) return bg(uv);
  vec3 acc=bg(uv); float w=1.;
  // 6 golden-angle taps + their left/right mirrors → kernel is mirror-symmetric (keeps the look symmetric)
  for(int i=0;i<6;i++){
    float a=float(i)*2.39996323; float r=sqrt((float(i)+0.5)/6.)*rPx;
    vec2 o=vec2(cos(a),sin(a))*r;
    acc+=bg(uv+o*uBgUvPx)+bg(uv+vec2(-o.x,o.y)*uBgUvPx); w+=2.;
  }
  return acc/w;
}

void main(){
  vec2 full=uSize+2.*uPad;
  vec2 p=vUv*full-uPad-uSize*0.5;          // css px from shape centre, y down
  float s=sdTrue(p);
  float aa=clamp(0.5-s*uDpr,0.,1.);       // 1 device-pixel antialiasing
  // drop shadow (outside the shape)
  float sh=0.;
  if(uShadow>0.){ float so=sdTrue(p-vec2(0.,6.)); sh=uShadow*0.55*exp(-max(so,0.)/9.)*(1.-smoothstep(uPad*0.45,uPad*0.75,so)); } // fades to 0 before the canvas edge (no visible box)
  if(aa<=0.){ outColor=vec4(0.,0.,0.,sh); return; }

  float hmin=uHmin>0.?uHmin:min(uSize.x,uSize.y)*0.5;
  float W=max(2.,uCurv*hmin);
  float e=0.75;
  // depth from the TRUE boundary (continuous: height is 0 exactly at the visible edge);
  // direction from the smoothed bevel field (continuous: no crease at corners / along medial axes)
  float d=-s;
  vec2 g=vec2(sdBevel(p+vec2(e,0.),W)-sdBevel(p-vec2(e,0.),W), sdBevel(p+vec2(0.,e),W)-sdBevel(p-vec2(0.,e),W));
  float gl=length(g); g = gl>1e-5 ? g/gl : vec2(0.);   // outward boundary direction

  // convex bevel: height H(t)=T*sqrt(1-(1-t)^2), t=depth/W. Slope clamped near the rim to stay finite.
  float t=clamp(d/W,0.,1.);
  float tc=max(t,0.035);
  float u=1.-tc;
  float slope=uThick*(u/sqrt(max(1.-u*u,1e-4)))/W;    // dH/d(depth)
  if(t>=1.) slope=0.;
  float H=uThick*sqrt(max(1.-(1.-t)*(1.-t),0.));
  vec3 N=normalize(vec3(g*slope,1.));                  // tilts outward toward the rim
  vec3 I=vec3(0.,0.,-1.);
  vec3 R=refract(I,N,1./uIor);
  float tir=dot(R,R)<1e-6?1.:0.;
  if(tir>0.5) R=reflect(I,N);
  float travel=H+uThick*0.35;                          // bevel height + base slab
  vec2 off=R.xy/max(-R.z,0.2)*travel*uStrength;
  if(uProfile==0){
    // rim lens: inward pull along the normal, magnitude (1-t)^2 — same curve as the chosen reference
    float m=(1.-t)*(1.-t);
    off=-g*m*uThick*(uIor-1.)*2.*uStrength;
    N=normalize(vec3(g*m*2.,1.));                        // matching surface tilt for Fresnel / highlight
  }
  float ol=length(off); float mo=uMaxOff*hmin; if(ol>mo) off*=mo/ol;

  vec2 uv=uBgUv0+(p+uSize*0.5)*uBgUvPx;
  vec2 ouv=uv+off*uBgUvPx;
  vec3 col;
  bool rimZone=t<1.;                                   // flat interior: no bending → skip extra taps (perf)
  if(uDisp>0. && rimZone){
    vec2 dd=off*uDisp*uBgUvPx*4.;
    col=vec3(bgBlur(ouv-dd,uBlur).r, bgBlur(ouv,uBlur).g, bgBlur(ouv+dd,uBlur).b);
  } else col=bgBlur(ouv,uBlur);

  // Fresnel (Schlick) — reflection of the surroundings, approximated by a mirrored, softened backdrop sample
  float cosT=clamp(N.z,0.,1.);
  float F0=pow((uIor-1.)/(uIor+1.),2.);
  float F=F0+(1.-F0)*pow(1.-cosT,5.);
  float rimBand=1.-t;
  if(rimZone){
    vec3 env=bgBlur(uv-off*uBgUvPx*1.4,uBlur+6.)*1.15+0.08;
    col=mix(col,env,clamp(F*uFresnel*1.6,0.,1.));
    // subtle internal reflection near the rim
    col+=uReflect*rimBand*rimBand*0.35*bgBlur(uv+off*uBgUvPx*-0.6,uBlur+3.);
  } else {
    col=mix(col,col*1.15+0.08,clamp(F*uFresnel*1.6,0.,1.));   // flat face: F = F0, no environment lookup needed
  }
  // light-facing rim highlight + soft specular
  vec3 L=normalize(vec3(uLight,0.9));
  float facing=max(dot(g,uLight),0.);
  float rim=exp(-max(-s,0.)*uDpr/1.6)*(0.25+0.75*facing)+exp(-max(-s,0.)*uDpr/1.6)*0.25*max(dot(g,-uLight),0.);
  float spec=pow(max(dot(N,normalize(L+vec3(0.,0.,1.))),0.),48.)*step(0.001,1.-t);
  col+=uEdge*(rim*0.55+spec*0.6);
  // tint
  col=mix(col,uTint.rgb,uTint.a);

  if(uDebug==1) col=N*0.5+0.5;
  else if(uDebug==2) col=vec3(0.5+off/(2.*max(mo,1.)),0.5);
  else if(uDebug==3) col=vec3(fract(d/8.),t,1.-t);

  col=clamp(col,0.,1.);
  float a=aa+sh*(1.-aa);
  outColor=vec4(col*aa,a);
}`;

// ---------------------------------------------------------------------------------------------------------------
// CPU distance field for SVG paths / polygons (exact Euclidean DT, Felzenszwalb & Huttenlocher)
// ---------------------------------------------------------------------------------------------------------------
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt(grid, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  return grid;
}
function boxBlur(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0; for (let i = -r; i <= r; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = a / k;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0; for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = a / k;
  }
  return out;
}
/** Returns {data: Float32Array RG, w, h} — signed distance in CSS px (negative inside). */
function buildShapeSdf(shape, cssW, cssH, bevelPx, scale = 1) {
  const w = Math.max(8, Math.min(512, Math.round(cssW * scale))), h = Math.max(8, Math.min(512, Math.round(cssH * scale)));
  if (shape.type === 'union') return buildUnionSdf(shape, cssW, cssH, w, h);
  const sx = w / cssW, sy = h / cssH;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  if (shape.type === 'path') {
    const [vx, vy, vw, vh] = shape.viewBox || [0, 0, 100, 100];
    ctx.setTransform(w / vw, 0, 0, h / vh, -vx * w / vw, -vy * h / vh);
    ctx.fill(new Path2D(shape.d), shape.fillRule || 'nonzero');
  } else {
    const pts = shape.points || [];
    const px = shape.units === 'px' ? (q) => [q[0] * sx, q[1] * sy] : (q) => [q[0] * w, q[1] * h];
    ctx.beginPath(); pts.forEach((q, i) => { const [x, y] = px(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
  }
  const a = ctx.getImageData(0, 0, w, h).data;
  const INF = 1e20, inG = new Float64Array(w * h), outG = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) { const inside = a[i * 4 + 3] >= 128; outG[i] = inside ? 0 : INF; inG[i] = inside ? INF : 0; }
  edt(outG, w, h); edt(inG, w, h);
  const pxPerCss = (sx + sy) / 2;
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sdf[i] = (outG[i] > 0 ? Math.sqrt(outG[i]) - 0.5 : -(Math.sqrt(inG[i]) - 0.5)) / pxPerCss;
  // smoothed copy for normals: rounds inner contours at convex corners (no medial-axis crease)
  const r = Math.max(1, Math.round((bevelPx * pxPerCss) / 3));
  const smooth = boxBlur(boxBlur(sdf, w, h, r), w, h, r);
  const data = new Float32Array(w * h * 2);
  for (let i = 0; i < w * h; i++) { data[i * 2] = sdf[i]; data[i * 2 + 1] = smooth[i]; }
  return { data, w, h };
}

/**
 * Analytic smooth union of rounded rects (GlassEffectContainer). shape = { type:'union', k, rects:[{x,y,w,h,r}] }
 * in CSS px relative to the element. k = merge distance: shapes closer than ~k blend into one droplet.
 */
function sdRR(px, py, cx, cy, hx, hy, r) {
  r = Math.min(r, hx, hy);
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function unionDistance(shape, x, y) {
  let d = 1e9;
  for (const q of shape.rects) { if (q.w <= 0.5 || q.h <= 0.5) continue; d = smin(d, sdRR(x, y, q.x + q.w / 2, q.y + q.h / 2, q.w / 2, q.h / 2, q.r ?? Math.min(q.w, q.h) / 2), shape.k || 0); }
  return d;
}
function buildUnionSdf(shape, cssW, cssH, w, h) {
  const data = new Float32Array(w * h * 2), sx = cssW / w, sy = cssH / h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = unionDistance(shape, (i + 0.5) * sx, (j + 0.5) * sy), o = (j * w + i) * 2;
    data[o] = d; data[o + 1] = d;
  }
  return { data, w, h };
}

// ---------------------------------------------------------------------------------------------------------------
// colour parsing
// ---------------------------------------------------------------------------------------------------------------
let colorCtx = null;
function parseColor(css) {
  if (Array.isArray(css)) return css;
  colorCtx = colorCtx || document.createElement('canvas').getContext('2d');
  colorCtx.fillStyle = '#000'; colorCtx.fillStyle = css;
  const v = colorCtx.fillStyle;
  if (v.startsWith('#')) { const n = parseInt(v.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; }
  const m = v.match(/[\d.]+/g).map(Number);
  return [m[0] / 255, m[1] / 255, m[2] / 255, m[3] ?? 1];
}

// ---------------------------------------------------------------------------------------------------------------
// engine
// ---------------------------------------------------------------------------------------------------------------
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
function a11yBlocks() {
  const h = document.documentElement;
  return mq('(prefers-reduced-transparency: reduce)') || mq('(prefers-contrast: more)') || mq('(forced-colors: active)')
    || h.hasAttribute('data-lg-rt') || h.hasAttribute('data-lg-ic');
}

class Engine {
  constructor(gl, canvas) {
    this.gl = gl; this.canvas = canvas; this.instances = new Set(); this.textures = new Map();
    this.enabled = true; this.frame = 0; this.stats = { frames: 0, lastMs: 0, avgMs: 0 };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.u = {};
    for (const n of ['uSize', 'uPad', 'uDpr', 'uShape', 'uRadius', 'uSdf', 'uBg', 'uBgUv0', 'uBgUvPx', 'uIor', 'uThick', 'uCurv', 'uStrength', 'uEdge', 'uFresnel', 'uBlur', 'uReflect', 'uDisp', 'uShadow', 'uMaxOff', 'uTint', 'uLight', 'uDebug', 'uProfile', 'uHmin'])
      this.u[n] = gl.getUniformLocation(p, n);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;
    this.emptySdf = this.makeSdfTexture({ data: new Float32Array([-1, -1]), w: 1, h: 1 });
    this.io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => es.forEach((e) => { const i = e.target.__lgRefraction; if (i) i.visible = e.isIntersecting; this.kick(); })) : null;
    this.loop = this.loop.bind(this);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.instances.forEach((i) => i.fallback('context-lost')); });
  }
  makeSdfTexture(s) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, s.w, s.h, 0, gl.RG, gl.FLOAT, s.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  backdropTexture(src, dynamic) {
    const gl = this.gl;
    let rec = this.textures.get(src);
    if (!rec) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      rec = { tex: t, frame: -1, ready: false, version: 0, uploaded: -1 };
      this.textures.set(src, rec);
    }
    const ready = src instanceof HTMLVideoElement ? src.readyState >= 2 : src instanceof HTMLImageElement ? src.complete && src.naturalWidth > 0 : (src.width > 0 && src.height > 0);
    if (!ready) return null;
    // upload at most once per frame; static sources only when their version changes
    if (rec.frame !== this.frame && (dynamic || rec.uploaded !== rec.version)) {
      gl.bindTexture(gl.TEXTURE_2D, rec.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      rec.frame = this.frame; rec.uploaded = rec.version;
    }
    return rec.tex;
  }
  invalidate(src) { const r = this.textures.get(src); if (r) r.version++; this.kick(); }
  kick() { if (!this.raf && this.enabled) this.raf = requestAnimationFrame(this.loop); }
  loop() {
    this.raf = 0;
    if (!this.enabled || this.lost) return;
    const t0 = performance.now();
    this.frame++;
    let keep = false;
    for (const i of this.instances) { if (i.visible && i.active) { i.render(); if (i.opts.dynamic || i.tracking) keep = true; } }
    const ms = performance.now() - t0;
    this.stats.frames++; this.stats.lastMs = ms; this.stats.avgMs = this.stats.avgMs * 0.9 + ms * 0.1;
    if (keep || this.always) this.kick();
  }
}

let engineSingleton;
function engine() {
  if (engineSingleton !== undefined) return engineSingleton;
  try {
    if (typeof document === 'undefined' || /[?&]nowebgl\b/.test(location.search)) throw new Error('disabled');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    engineSingleton = new Engine(gl, canvas);
    addEventListener('scroll', () => engineSingleton.kick(), { passive: true, capture: true });
    addEventListener('resize', () => engineSingleton.kick(), { passive: true });
  } catch (e) {
    engineSingleton = null;
    supportInfo.reason = String(e && e.message || e);
  }
  return engineSingleton;
}
const supportInfo = { reason: '' };
function isSupported() { return !!engine(); }

// ---------------------------------------------------------------------------------------------------------------
// instance
// ---------------------------------------------------------------------------------------------------------------
class Glass {
  constructor(eng, el, opts) {
    this.eng = eng; this.el = el; this.visible = true; this.active = true;
    this.opts = { dynamic: false, shape: { type: 'roundedRect', radius: 24 }, debug: 0, ...opts, material: { ...(PRESETS[opts.preset] || SIGNATURE), ...(opts.material || {}) } };
    const c = document.createElement('canvas');
    c.className = 'lg-gl-canvas';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = `position:absolute;left:${-PAD}px;top:${-PAD}px;width:calc(100% + ${2 * PAD}px);height:calc(100% + ${2 * PAD}px);pointer-events:none;z-index:-1;`;
    el.prepend(c);
    this.canvas = c; this.ctx = c.getContext('2d');
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.setAttribute('data-lg-renderer', 'webgl');
    el.__lgRefraction = this;
    this.sdfKey = ''; this.sdfTex = null;
    eng.instances.add(this);
    eng.io && eng.io.observe(el);
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this.sdfKey = ''; eng.kick(); }) : null;
    this.ro && this.ro.observe(el);
    if (this.opts.interactiveLight) {
      this.onMove = (e) => { if (mq('(prefers-reduced-motion: reduce)')) return; const r = el.getBoundingClientRect(); const dx = (r.left + r.width / 2) - e.clientX, dy = (r.top + r.height / 2) - e.clientY; const l = Math.hypot(dx, dy) || 1; this.light = [-dx / l, -dy / l]; eng.kick(); };
      addEventListener('pointermove', this.onMove, { passive: true });
    }
    if (a11yBlocks()) this.fallback('accessibility');
    eng.kick();
  }
  update(o = {}) {
    if (o.material) this.opts.material = { ...this.opts.material, ...o.material };
    if (o.shape) { this.opts.shape = o.shape; this.sdfKey = ''; }
    for (const k of ['backdrop', 'dynamic', 'debug', 'backdropRect', 'scale']) if (k in o) this.opts[k] = o[k];
    this.eng.kick();
  }
  fallback(reason) {
    this.active = false;
    this.el.setAttribute('data-lg-renderer', 'fallback');
    this.el.setAttribute('data-lg-fallback-reason', reason);
    this.canvas.style.display = 'none';
  }
  resume() {
    if (a11yBlocks() || this.eng.lost) return;
    this.active = true; this.el.setAttribute('data-lg-renderer', 'webgl'); this.el.removeAttribute('data-lg-fallback-reason');
    this.canvas.style.display = ''; this.eng.kick();
  }
  ensureSdf(w, h, W, dpr) {
    const s = this.opts.shape;
    if (s.type !== 'path' && s.type !== 'polygon' && s.type !== 'union') return this.eng.emptySdf;
    const key = `${JSON.stringify(s)}|${Math.round(w)}x${Math.round(h)}|${Math.round(W)}`;
    if (key !== this.sdfKey) {
      if (this.sdfTex && this.sdfTex !== this.eng.emptySdf) this.eng.gl.deleteTexture(this.sdfTex);
      this.sdfTex = this.eng.makeSdfTexture(buildShapeSdf(s, w, h, W, s.type === 'union' ? 1 : Math.min(2, dpr)));
      this.sdfKey = key;
    }
    return this.sdfTex;
  }
  render() {
    const { gl, u } = this.eng, o = this.opts, m = o.material, src = o.backdrop;
    if (!src) return this.fallback('no-backdrop');
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const br = o.backdropRect ? o.backdropRect() : src.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.round((r.width + 2 * PAD) * dpr), ch = Math.round((r.height + 2 * PAD) * dpr);
    const tex = this.eng.backdropTexture(src, o.dynamic);
    if (!tex) return;
    // track moving geometry (scroll / transforms) → keep rendering while the rect changes
    const sig = `${r.left},${r.top},${r.width},${r.height},${br.left},${br.top},${br.width},${br.height}`;
    this.tracking = sig !== this.lastSig; this.lastSig = sig;
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const glc = this.eng.canvas;
    if (glc.width < cw || glc.height < ch) { glc.width = Math.max(glc.width, cw); glc.height = Math.max(glc.height, ch); }
    const hmin = Math.min(r.width, r.height) / 2;
    const W = Math.max(2, m.curvature * hmin);
    const sdf = this.ensureSdf(r.width, r.height, W, dpr);
    gl.viewport(0, glc.height - ch, cw, ch);
    gl.disable(gl.BLEND);
    gl.useProgram(this.eng.prog); gl.bindVertexArray(this.eng.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uBg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sdf); gl.uniform1i(u.uSdf, 1);
    gl.uniform2f(u.uSize, r.width, r.height); gl.uniform1f(u.uPad, PAD); gl.uniform1f(u.uDpr, dpr);
    const shapeId = SHAPES[o.shape.type] ?? 1;
    gl.uniform1i(u.uShape, shapeId);
    gl.uniform1f(u.uRadius, o.shape.radius ?? 0);
    gl.uniform2f(u.uBgUv0, (r.left - br.left) / br.width, (r.top - br.top) / br.height);
    gl.uniform2f(u.uBgUvPx, 1 / br.width, 1 / br.height);
    gl.uniform1f(u.uIor, Math.max(1.0001, m.ior)); gl.uniform1f(u.uThick, m.thickness); gl.uniform1f(u.uCurv, m.curvature);
    gl.uniform1f(u.uStrength, m.refraction); gl.uniform1f(u.uEdge, m.edge); gl.uniform1f(u.uFresnel, m.fresnel);
    gl.uniform1f(u.uBlur, m.blur); gl.uniform1f(u.uReflect, m.reflection); gl.uniform1f(u.uDisp, m.dispersion);
    gl.uniform1f(u.uShadow, m.shadow); gl.uniform1f(u.uMaxOff, m.maxOffset);
    const tint = parseColor(m.tint); gl.uniform4f(u.uTint, tint[0], tint[1], tint[2], tint[3]);
    const la = (m.lightAngle * Math.PI) / 180; const L = this.light || [Math.cos(la), Math.sin(la)];
    gl.uniform2f(u.uLight, L[0], L[1]);
    gl.uniform1f(u.uHmin, o.shape.hmin || 0);
    gl.uniform1i(u.uDebug, o.debug | 0);
    gl.uniform1i(u.uProfile, m.profile === 'physical' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(glc, 0, 0, cw, ch, 0, 0, cw, ch);
    this.rendered = (this.rendered || 0) + 1;
  }
  destroy() {
    this.eng.instances.delete(this);
    this.eng.io && this.eng.io.unobserve(this.el);
    this.ro && this.ro.disconnect();
    this.onMove && removeEventListener('pointermove', this.onMove);
    if (this.sdfTex && this.sdfTex !== this.eng.emptySdf) this.eng.gl.deleteTexture(this.sdfTex);
    this.canvas.remove();
    this.el.removeAttribute('data-lg-renderer'); this.el.removeAttribute('data-lg-fallback-reason');
    delete this.el.__lgRefraction;
  }
}

/** Fallback-only handle when WebGL2 is unavailable: tags the element and uses v1 SVG/blur if loaded. */
class FallbackGlass {
  constructor(el, reason) {
    this.el = el; this.active = false;
    el.setAttribute('data-lg-renderer', 'fallback'); el.setAttribute('data-lg-fallback-reason', reason);
    const v1 = typeof window !== 'undefined' && window.LG;
    if (v1 && v1.refract) v1.refract(el, el.dataset.lgSize || 'md');
  }
  update() {} resume() {} destroy() { this.el.removeAttribute('data-lg-renderer'); this.el.removeAttribute('data-lg-fallback-reason'); }
}

function attach(el, opts = {}) {
  const forced = typeof location !== 'undefined' && /[?&]renderer=(svg|blur)\b/.exec(location.search);
  if (forced) return new FallbackGlass(el, `forced-${forced[1]}`);
  const eng = engine();
  if (!eng) return new FallbackGlass(el, 'no-webgl2');
  if (!opts.backdrop) return new FallbackGlass(el, 'no-backdrop');
  return new Glass(eng, el, opts);
}

// ---------------------------------------------------------------------------------------------------------------
// Declarative use: <div data-lg-glass> … </div> over an element marked data-lg-backdrop-source
//   data-lg-glass="auto|circle|ellipse|rect|roundedRect|capsule"   (auto = read border-radius)
//   data-lg-preset="signature|control|media|overlay|overlay-dark"  (default signature)
//   data-lg-backdrop="#css-selector"                               (default: the backdrop source under the element)
//   data-lg-material='{"blur":4}'                                  (JSON overrides)
// ---------------------------------------------------------------------------------------------------------------
function shapeFromElement(el) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const raw = cs.borderTopLeftRadius || '0px';
  const half = Math.min(r.width, r.height) / 2;
  if (raw.endsWith('%')) { const pct = parseFloat(raw); if (pct >= 50) return Math.abs(r.width - r.height) < 1 ? { type: 'circle' } : { type: 'ellipse' }; return { type: 'roundedRect', radius: (pct / 100) * Math.min(r.width, r.height) }; }
  const px = parseFloat(raw) || 0;
  if (px >= half - 0.5) return Math.abs(r.width - r.height) < 1 ? { type: 'circle' } : { type: 'capsule' };
  return px > 0 ? { type: 'roundedRect', radius: px } : { type: 'rect' };
}
function findBackdrop(el) {
  const sel = el.getAttribute('data-lg-backdrop');
  if (sel) return document.querySelector(sel);
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const all = [...document.querySelectorAll('[data-lg-backdrop-source]')];
  return all.find((b) => { const q = b.getBoundingClientRect(); return cx >= q.left && cx <= q.right && cy >= q.top && cy <= q.bottom; }) || all[0] || null;
}
function autoAttach(root = document, { observe = false } = {}) {
  const handles = [];
  const one = (el) => {
    if (el.__lgRefraction || el.__lgAuto) return;
    el.__lgAuto = true;
    const kind = el.getAttribute('data-lg-glass') || 'auto';
    const shape = kind === 'auto' || kind === '' ? shapeFromElement(el) : kind === 'roundedRect' ? { type: 'roundedRect', radius: parseFloat(el.getAttribute('data-lg-radius')) || parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16 } : { type: kind };
    let material; try { material = JSON.parse(el.getAttribute('data-lg-material') || 'null') || undefined; } catch { material = undefined; }
    const backdrop = findBackdrop(el);
    const dynamic = backdrop instanceof HTMLVideoElement || backdrop?.hasAttribute?.('data-lg-dynamic');
    handles.push(attach(el, { backdrop, shape, preset: el.getAttribute('data-lg-preset') || 'signature', material, dynamic }));
  };
  root.querySelectorAll('[data-lg-glass]').forEach(one);
  if (observe && typeof MutationObserver === 'function') {
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches('[data-lg-glass]')) one(n);
      n.querySelectorAll && n.querySelectorAll('[data-lg-glass]').forEach(one);
    }))).observe(root === document ? document.body : root, { childList: true, subtree: true });
  }
  return handles;
}

/** Re-check accessibility settings (call after toggling data-lg-rt / data-lg-ic or on media query change). */
function refresh() {
  const e = engine(); if (!e) return;
  const block = a11yBlocks();
  e.instances.forEach((i) => (block ? i.fallback('accessibility') : i.resume()));
}
function disableAll() { const e = engine(); if (!e) return; e.enabled = false; e.instances.forEach((i) => i.fallback('disabled')); }
function enableAll() { const e = engine(); if (!e) return; e.enabled = true; e.instances.forEach((i) => i.resume()); }
/** Render all visible instances synchronously (call right after you redraw an animated backdrop canvas). */
function renderNow() { const e = engine(); if (!e || !e.enabled) return; if (e.raf) { cancelAnimationFrame(e.raf); e.raf = 0; } e.loop(); }
function invalidate(src) { const e = engine(); e && e.invalidate(src); }
function stats() { const e = engine(); return e ? { ...e.stats, instances: e.instances.size, renderer: e.gl.getParameter(e.gl.RENDERER) } : null; }

if (typeof matchMedia === 'function') {
  ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)'].forEach((q) => {
    const m = matchMedia(q); m.addEventListener && m.addEventListener('change', refresh);
  });
}

const LGRefraction = { attach, autoAttach, shapeFromElement, SIGNATURE, PRESETS, engine, isSupported, supportInfo, refresh, disableAll, enableAll, invalidate, renderNow, stats, buildShapeSdf, DEFAULT_MATERIAL };
if (typeof window !== 'undefined') window.LGRefraction = LGRefraction;

})();
