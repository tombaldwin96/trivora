import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

type ImageCardProps = {
  source: { uri: string };
  title: string;
  subtitle?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
} & Record<string, unknown>;

export const ImageCard = React.forwardRef<typeof Pressable, ImageCardProps>(
  function ImageCard({ source, title, subtitle, onPress, disabled, style, ...rest }, ref) {
    const content = (
      <ImageBackground source={source} style={[styles.bg, style]} imageStyle={styles.imgStyle}>
        <View style={styles.overlay} />
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </ImageBackground>
    );

    if (disabled) {
      return <View style={[styles.wrapper, style]}>{content}</View>;
    }
    return (
      <Pressable ref={ref} onPress={onPress} style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]} {...rest}>
        {content}
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  pressed: { opacity: 0.9 },
  bg: { height: 140, justifyContent: 'flex-end', borderRadius: 16 },
  imgStyle: { borderRadius: 16 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
  },
  textWrap: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
});
