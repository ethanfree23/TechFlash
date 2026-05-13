import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

/* Context module: Provider + hook; not a components-only file for fast refresh. */
/* eslint-disable react-refresh/only-export-components */

const noop = () => {};
const defaultRegistry = { register: () => noop, expandAll: noop, collapseAll: noop };
const CollapsibleSectionsContext = createContext(defaultRegistry);

export function CollapsibleSectionsProvider({ children }) {
  const settersRef = useRef(new Set());
  const register = useCallback((setter) => {
    settersRef.current.add(setter);
    return () => settersRef.current.delete(setter);
  }, []);
  const expandAll = useCallback(() => {
    settersRef.current.forEach((fn) => fn(true));
  }, []);
  const collapseAll = useCallback(() => {
    settersRef.current.forEach((fn) => fn(false));
  }, []);
  const value = useMemo(
    () => ({ register, expandAll, collapseAll }),
    [register, expandAll, collapseAll]
  );
  return (
    <CollapsibleSectionsContext.Provider value={value}>{children}</CollapsibleSectionsContext.Provider>
  );
}

export function useCollapsibleSections() {
  return useContext(CollapsibleSectionsContext);
}
