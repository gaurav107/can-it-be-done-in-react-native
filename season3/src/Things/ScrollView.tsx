import React, { ReactNode, memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useMemoOne } from "use-memo-one";
import { snapPoint } from "react-native-redash";
import {
  frictionFactor,
  verticalPanGestureHandler
} from "../components/AnimationHelpers";
import { THRESHOLD } from "./Search";

const {
  Value,
  Clock,
  eq,
  startClock,
  set,
  add,
  and,
  greaterOrEq,
  lessOrEq,
  cond,
  decay,
  block,
  not,
  spring,
  abs,
  multiply,
  divide,
  sub,
  useCode,
  call,
  neq
} = Animated;

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});

interface WithScrollParams {
  value: Animated.Adaptable<number>;
  velocity: Animated.Adaptable<number>;
  state: Animated.Value<State>;
  lowerBound: number;
  upperBound: number;
}

/*
0. Start clock
1. When the gesture becomes active, we keep the dragging = 1, offset = position
2. When the gesture becomes inactive, draggin = 0
3. If the finger position (offset + value) is within lowerBound and upperBound position = offset + value
4. If offset + value > upperBound or offset + value < lowerBound, we add gravity to the translation
5. When the gesture  becomes inactive and is outside the bounds: spring to the corresponding bound
6. Springing should rest at position and not trigger any decay
7. When the gesture becomes inactive and is is bound: decay
*/
function withScroll({
  value,
  state: gestureState,
  velocity: gestureVelocity,
  upperBound,
  lowerBound
}: WithScrollParams) {
  const dragging = new Value(0);
  const start = new Value(0);
  const offset = new Value(0);
  const isSpringing = new Value(0);
  const clock = new Clock();
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0)
  };

  const isInBound = (v: Animated.Node<number>) =>
    and(lessOrEq(v, upperBound), greaterOrEq(v, lowerBound));

  const restingSpring = spring(clock, state, {
    toValue: snapPoint(state.position, state.velocity, [
      lowerBound,
      upperBound
    ]),
    damping: 40,
    mass: 1,
    stiffness: 150,
    overshootClamping: true,
    restSpeedThreshold: 0.1,
    restDisplacementThreshold: 0.1
  });

  const delta = sub(
    offset,
    cond(greaterOrEq(offset, 0), upperBound, lowerBound)
  );

  return block([
    startClock(clock),
    cond(
      eq(gestureState, State.ACTIVE),
      [
        cond(dragging, 0, [set(dragging, 1), set(start, state.position)]),
        set(offset, add(start, value)),
        cond(
          isInBound(offset),
          [set(state.position, offset), set(state.velocity, offset)],
          [
            set(
              state.position,
              sub(
                offset,
                multiply(delta, frictionFactor(divide(1, abs(delta))))
              )
            )
          ]
        )
      ],
      [
        cond(eq(dragging, 1), [
          set(state.velocity, gestureVelocity),
          set(dragging, 0),
          set(isSpringing, 0)
        ]),
        cond(
          and(isInBound(state.position), not(isSpringing)),
          [decay(clock, state, { deceleration: 0.997 })],
          [set(isSpringing, 1), restingSpring]
        )
      ]
    ),
    state.position
  ]);
}

interface ScrollViewProps {
  children: ReactNode;
  y: Animated.Value<number>;
  onPull: () => void;
}

export default memo(({ children, y, onPull }: ScrollViewProps) => {
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const { gestureHandler, translationY, velocityY, state } = useMemoOne(
    () => verticalPanGestureHandler(),
    []
  );
  const lowerBound = -1 * (contentHeight - containerHeight);
  const upperBound = 0;
  const translateY = withScroll({
    value: translationY,
    velocity: velocityY,
    state,
    lowerBound,
    upperBound
  });
  useCode(
    block([
      set(y, translateY),
      cond(
        and(greaterOrEq(y, THRESHOLD), neq(state, State.ACTIVE)),
        call([], onPull)
      )
    ]),
    []
  );

  return (
    <View
      style={styles.container}
      onLayout={({
        nativeEvent: {
          layout: { height }
        }
      }) => setContainerHeight(height)}
    >
      <PanGestureHandler {...gestureHandler}>
        <Animated.View
          style={{
            transform: [{ translateY }]
          }}
          onLayout={({
            nativeEvent: {
              layout: { height }
            }
          }) => setContentHeight(height)}
        >
          {children}
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
});
