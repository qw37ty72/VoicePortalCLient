import { createContext, useContext, useMemo, useState } from 'react';

function getInitialAnimations() {
  try {
    return JSON.parse(localStorage.getItem('vp_animations') ?? 'true');
  } catch {
    return true;
  }
}

const INITIAL_ANIMATIONS = getInitialAnimations();

const AnimationsContext = createContext({ animations: true, setAnimations: () => {} });

export function useAnimations() {
  return useContext(AnimationsContext);
}

export function AnimationsProvider({ children }) {
  const [animations, setAnimations] = useState(INITIAL_ANIMATIONS);

  const value = useMemo(
    () => ({
      animations,
      setAnimations: (v) => {
        const val = typeof v === 'function' ? v(animations) : v;
        setAnimations(val);
        localStorage.setItem('vp_animations', JSON.stringify(val));
      },
    }),
    [animations]
  );

  return (
    <AnimationsContext.Provider value={value}>
      {children}
    </AnimationsContext.Provider>
  );
}
