import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function Button({ label, onPress, disabled }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, friction: 8 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}>
      <Animated.View style={[styles.btn, disabled && styles.disabled, { transform: [{ scale }] }]}>
        <Text style={styles.text}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: '#5C6BC0', padding: 14, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
