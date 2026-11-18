# Before / after examples

## Vanilla web — floating toolbar
Before:
```html
<div class="toolbar"><button onclick="share()">⤴</button><button onclick="more()">⋯</button></div>
```
After (handlers untouched):
```html
<div class="toolbar lg-glass lg-group" role="group" aria-label="Actions" data-lg-layer="navigation">
  <button class="lg-btn lg-btn--icon" aria-label="Share" data-lg-interactive onclick="share()">⤴</button>
  <button class="lg-btn lg-btn--icon" aria-label="More" data-lg-interactive data-lg-menu-trigger="more-menu">⋯</button>
</div>
<div id="more-menu" class="lg-glass lg-glass--lg lg-menu" role="menu" hidden>
  <button role="menuitem" onclick="more()">More…</button>
</div>
<script src="liquid-glass.iife.js"></script><script>LG.init()</script>
```

## React — bottom navigation
Before:
```tsx
<nav className="bottom-nav">{tabs.map(t => <button key={t.id} onClick={() => go(t.id)} className={t.id===route?'active':''}>{t.label}</button>)}</nav>
```
After:
```tsx
<FloatingTabBar aria-label="Main" value={route} onChange={go} scrollRef={mainRef}
  options={tabs.map(t => ({ value: t.id, label: t.label, icon: t.icon }))} onSearch={openSearch} />
```

## SwiftUI — custom floating button
Before:
```swift
Button(action: compose) { Image(systemName: "square.and.pencil") }
  .padding().background(.ultraThinMaterial, in: Circle())
```
After:
```swift
Button(action: compose) { Image(systemName: "square.and.pencil").frame(width: 44, height: 44) }
  .buttonStyle(.plain)
  .accessibilityLabel("Compose")
  .lgGlass(interactive: true)          // real glassEffect on iOS 26, material fallback before
```
Toolbar with a custom background → delete `.toolbarBackground(...)`; system glass appears on iOS 26.

## React Native — card stays plain, header button becomes glass
```tsx
<View style={styles.card}>{/* content layer: unchanged */}</View>
<GlassButton accessibilityLabel="Filter" icon={<FilterIcon />} onPress={openFilter} />
```

## Anti-examples (refuse or push back)
- "Make every card glass" → content layer; offer standard material or subtle elevation instead.
- Glass button inside a glass sheet → use a plain/tinted fill button inside the sheet.
- Clear glass over a white settings page → use regular.
