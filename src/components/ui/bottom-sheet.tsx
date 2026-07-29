import { useEffect, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { usePanGesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const SPRING_CONFIG = { damping: 40, stiffness: 400, mass: 0.6 };

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  height: number;
  children: ReactNode;
};

export function BottomSheet({ visible, onClose, height, children }: BottomSheetProps) {
  const translateY = useSharedValue(height);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withSpring(1, SPRING_CONFIG);
    } else {
      translateY.value = withSpring(height, SPRING_CONFIG);
      backdropOpacity.value = withSpring(0, SPRING_CONFIG);
    }
  }, [visible, height]);

  const gesture = usePanGesture({
    onUpdate: (e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        backdropOpacity.value = 1 - e.translationY / height;
      }
    },
    onDeactivate: (e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        translateY.value = withSpring(height, SPRING_CONFIG);
        backdropOpacity.value = withSpring(0, SPRING_CONFIG);
        scheduleOnRN(onClose);
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
        backdropOpacity.value = withSpring(1, SPRING_CONFIG);
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <View className="absolute inset-0 z-40" pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={backdropStyle} className="absolute inset-0 bg-black/60">
        <Pressable className="flex-1" onPress={onClose} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={animatedStyle}
          className="absolute bottom-0 left-0 right-0 bg-[#111] rounded-t-2xl"
        >
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-white/30" />
          </View>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
