import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1,    friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 500,            useNativeDriver: true }),
      ]),
      Animated.delay(800),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 0.9,  duration: 350,            useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,    duration: 350,            useNativeDriver: true }),
      ]),
    ]).start(() => onFinish());
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={require('../../assets/Kumva-New-Logo-D.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 220, height: 160 },
});
