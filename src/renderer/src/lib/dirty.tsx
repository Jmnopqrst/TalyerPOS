import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export const DirtyContext = createContext<{ isDirty: boolean; setDirty: (key: string, dirty: boolean) => void } | null>(null);

export function confirmDiscardChanges(isDirty: boolean) {
  return !isDirty || window.confirm("You have unsaved changes. Close without saving?");
}

export function DirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      const exists = current.includes(key);
      if (dirty && !exists) return [...current, key];
      if (!dirty && exists) return current.filter((item) => item !== key);
      return current;
    });
  }, []);

  const value = useMemo(() => ({ isDirty: dirtyKeys.length > 0, setDirty }), [dirtyKeys.length, setDirty]);

  useEffect(() => {
    if (dirtyKeys.length === 0) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirtyKeys.length]);

  return (
    <DirtyContext.Provider value={value}>
      {children}
    </DirtyContext.Provider>
  );
}

export function useUnsavedChanges(key: string, dirty: boolean) {
  const context = useContext(DirtyContext);

  useEffect(() => {
    context?.setDirty(key, dirty);
    return () => context?.setDirty(key, false);
  }, [context, dirty, key]);
}
