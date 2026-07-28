import { useEffect, useMemo } from "react";
import { type SkImage } from "@shopify/react-native-skia";
import {
  usePanGesture,
  usePinchGesture,
  useTapGesture,
  useSimultaneousGestures,
  useCompetingGestures,
} from "react-native-gesture-handler";
import {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type PanZoomConfig = {
  image: SkImage | null;
  canvasWidth: number;
  canvasHeight: number;
};

export function usePanZoom({ image, canvasWidth, canvasHeight }: PanZoomConfig) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // fit="contain" under the current canvas size — recomputed only when
  // image or canvas dimensions change.
  const displayDims = useMemo(() => {
    if (!image || canvasHeight <= 0) return null;
    const iw = image.width();
    const ih = image.height();
    if (iw === 0 || ih === 0) return null;
    const imageAspect = iw / ih;
    const containerAspect = canvasWidth / canvasHeight;
    if (imageAspect > containerAspect) {
      return { w: canvasWidth, h: canvasWidth / imageAspect };
    }
    return { w: canvasHeight * imageAspect, h: canvasHeight };
  }, [image, canvasWidth, canvasHeight]);

  const displayW = useSharedValue(displayDims?.w ?? canvasWidth);
  const displayH = useSharedValue(displayDims?.h ?? canvasHeight);
  useEffect(() => {
    if (displayDims) {
      displayW.value = displayDims.w;
      displayH.value = displayDims.h;
    }
  }, [displayDims]);

  const clampTranslation = () => {
    "worklet";
    const s = scale.value;
    const dw = displayW.value;
    const dh = displayH.value;
    const maxX = Math.max(0, (dw * s - canvasWidth) / 2);
    const maxY = Math.max(0, (dh * s - canvasHeight) / 2);
    translateX.value = Math.max(-maxX, Math.min(maxX, translateX.value));
    translateY.value = Math.max(-maxY, Math.min(maxY, translateY.value));
  };

  const pinchGesture = usePinchGesture({
    onBegin: () => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
    onUpdate: (e) => {
      scale.value = Math.max(0.5, Math.min(savedScale.value * e.scale, 5));
    },
    onDeactivate: () => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        clampTranslation();
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    },
  });

  const twoFingerPan = usePanGesture({
    minPointers: 2,
    onBegin: () => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
    onUpdate: (e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    },
    onDeactivate: () => {
      clampTranslation();
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
  });

  const singleFingerPan = usePanGesture({
    maxPointers: 1,
    onBegin: () => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
    onUpdate: (e) => {
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    },
    onDeactivate: () => {
      clampTranslation();
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
  });

  const doubleTapGesture = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: () => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 2;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    },
  });

  const twoFinger = useSimultaneousGestures(pinchGesture, twoFingerPan);
  const gesture = useCompetingGestures(doubleTapGesture, twoFinger, singleFingerPan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // reanimated v4: useAnimatedStyle return doesn't narrow across hook
  // boundaries — the caller casts at the Animated.View style prop.
  return { gesture, animatedStyle: animatedStyle as any, scale, translateX, translateY };
}
