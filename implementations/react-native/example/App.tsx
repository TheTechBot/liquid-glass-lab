// Example: existing screen adopting Liquid Glass. App state/handlers are untouched; only chrome changes.
import React, { useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiquidGlassProvider, GlassButton, FloatingTabBar, GlassMediaControls, useMinimizeOnScroll, useGlassCapabilities } from '../src';

function Screen() {
  const [tab, setTab] = useState<'home' | 'browse' | 'library'>('home');
  const [playing, setPlaying] = useState(true);
  const [log, setLog] = useState('');
  const { minimized, onScroll } = useMinimizeOnScroll();
  const caps = useGlassCapabilities();
  return (
    <View style={{ flex: 1, backgroundColor: caps.scheme === 'dark' ? '#000' : '#f2f2f7' }}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ padding: 16, paddingTop: 110, paddingBottom: 140 }}>
        {/* content layer: no glass */}
        <ImageBackground source={{ uri: 'https://picsum.photos/800/900' }} style={styles.hero} imageStyle={{ borderRadius: 34 }}>
          <GlassMediaControls playing={playing} onToggle={() => setPlaying((p) => !p)} onPrev={() => setLog('prev')} onNext={() => setLog('next')} />
        </ImageBackground>
        <Text style={styles.note}>Glass tier: {caps.tier}{caps.reduceTransparency ? ' (Reduce Transparency on)' : ''}</Text>
        {Array.from({ length: 20 }, (_, i) => <Text key={i} style={styles.row}>Track {i + 1}</Text>)}
        <Text>{log}</Text>
      </ScrollView>
      {/* navigation layer */}
      <View style={styles.top}>
        <GlassButton accessibilityLabel="Back" icon={<Text style={{ fontSize: 20 }}>‹</Text>} onPress={() => setLog('back')} />
        <GlassButton prominent accessibilityLabel="Add to library" icon={<Text style={{ fontSize: 22, color: '#fff' }}>+</Text>} onPress={() => setLog('added')} />
      </View>
      <FloatingTabBar minimized={minimized} value={tab} onChange={setTab} onSearch={() => setLog('search')}
        tabs={[{ value: 'home', label: 'Home' }, { value: 'browse', label: 'Browse' }, { value: 'library', label: 'Library' }]} />
    </View>
  );
}

export default function App() {
  return <LiquidGlassProvider><Screen /></LiquidGlassProvider>;
}

const styles = StyleSheet.create({
  hero: { height: 380, justifyContent: 'flex-end', paddingBottom: 22, marginBottom: 16 },
  note: { marginVertical: 8, opacity: 0.6 },
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,.3)' },
  top: { position: 'absolute', top: 56, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
});
