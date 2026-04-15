import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface KumvaLogoProps {
  size?: 'small' | 'large';
}

export default function KumvaLogo({ size = 'large' }: KumvaLogoProps) {
  const scale = size === 'large' ? 1 : 0.55;
  const s = (n: number) => n * scale;

  return (
    <View style={styles.wrapper}>
      {/* WiFi arc icon */}
      <View style={[styles.iconWrap, { width: s(48), height: s(40), marginBottom: s(2) }]}>
        {/* arcs */}
        <View style={[styles.arc, styles.arc3, { width: s(40), height: s(40), borderRadius: s(20), borderColor: '#E53935', top: s(8), left: s(4) }]} />
        <View style={[styles.arc, styles.arc2, { width: s(28), height: s(28), borderRadius: s(14), borderColor: '#43A047', top: s(14), left: s(10) }]} />
        <View style={[styles.arc, styles.arc1, { width: s(16), height: s(16), borderRadius: s(8), borderColor: '#1E88E5', top: s(20), left: s(16) }]} />
        {/* dot */}
        <View style={[styles.dot, { width: s(6), height: s(6), borderRadius: s(3), top: s(30), left: s(21) }]} />
      </View>

      {/* Text row */}
      <View style={styles.textRow}>
        <Text style={[styles.kumva, { fontSize: s(28) }]}>Kumv</Text>
        <View style={[styles.aWrap, { width: s(20), height: s(36) }]}>
          {/* the "A" with node dots */}
          <Text style={[styles.kumva, { fontSize: s(28) }]}>A</Text>
          {/* bottom-right node dot */}
          <View style={[styles.nodeDot, { width: s(7), height: s(7), borderRadius: s(3.5), bottom: s(2), right: s(-2) }]} />
        </View>
      </View>

      {/* "insights" subtitle */}
      <Text style={[styles.insights, { fontSize: s(11), marginTop: s(-2) }]}>insights</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  iconWrap: { position: 'relative' },
  arc: {
    position: 'absolute',
    borderWidth: 3,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{ rotate: '0deg' }],
  },
  arc3: {},
  arc2: {},
  arc1: {},
  dot: { position: 'absolute', backgroundColor: '#1565C0' },
  textRow: { flexDirection: 'row', alignItems: 'flex-end' },
  kumva: { fontWeight: '800', color: '#2E3A59', letterSpacing: -0.5 },
  aWrap: { position: 'relative', justifyContent: 'flex-end' },
  nodeDot: { position: 'absolute', backgroundColor: '#2E3A59' },
  insights: { color: '#43A047', fontWeight: '600', letterSpacing: 0.5 },
});
