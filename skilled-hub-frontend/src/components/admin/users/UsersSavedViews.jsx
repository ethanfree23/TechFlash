import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaChevronRight, FaTimes } from 'react-icons/fa';
import { SAVED_VIEW_PRESETS } from '../../../utils/adminUsersDisplayAdapter';

export const SAVED_VIEWS_KEY = 'admin_users_saved_views';

const PRIMARY_MENU_WIDTH = 152;
const CHOOSE_MENU_WIDTH = 240;

function loadCustomViews() {
  try {
    const existing = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]');
    return Array.isArray(existing) ? existing : [];
  } catch {
    return [];
  }
}

function customViewId(view) {
  return `custom:${view.id}`;
}

function toSelectable(view) {
  return {
    id: customViewId(view),
    label: view.name,
    tab: view.tab || 'all',
    filters: view.filters || {},
  };
}

export default function UsersSavedViews({
  activeViewId,
  onSelectView,
  filters,
  activeTab,
}) {
  const [open, setOpen] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [chooseCoords, setChooseCoords] = useState({ top: 0, left: 0 });
  const [customViews, setCustomViews] = useState(loadCustomViews);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const chooseRef = useRef(null);
  const chooseCloseTimer = useRef(null);

  const closeAll = useCallback(() => {
    setOpen(false);
    setChooseOpen(false);
  }, []);

  const cancelChooseClose = () => {
    if (chooseCloseTimer.current) {
      clearTimeout(chooseCloseTimer.current);
      chooseCloseTimer.current = null;
    }
  };

  const openChoose = () => {
    cancelChooseClose();
    setChooseOpen(true);
  };

  const scheduleCloseChoose = () => {
    cancelChooseClose();
    chooseCloseTimer.current = setTimeout(() => setChooseOpen(false), 160);
  };

  useEffect(() => () => cancelChooseClose(), []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (
        buttonRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target) ||
        chooseRef.current?.contains(e.target)
      ) {
        return;
      }
      closeAll();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (chooseOpen) setChooseOpen(false);
      else closeAll();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, chooseOpen, closeAll]);

  const placePrimaryMenu = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PRIMARY_MENU_WIDTH - 8));
    setMenuCoords({ top: rect.bottom + 4, left });
  }, []);

  const placeChooseMenu = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const width = chooseRef.current?.offsetWidth || CHOOSE_MENU_WIDTH;
    const openRight = rect.right + 8 + width <= window.innerWidth - 8;
    const left = openRight
      ? rect.right + 4
      : Math.max(8, rect.left - width - 4);
    const height = chooseRef.current?.offsetHeight || 320;
    let top = rect.top;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - height - 8);
    }
    setChooseCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    placePrimaryMenu();
    window.addEventListener('resize', placePrimaryMenu);
    window.addEventListener('scroll', placePrimaryMenu, true);
    return () => {
      window.removeEventListener('resize', placePrimaryMenu);
      window.removeEventListener('scroll', placePrimaryMenu, true);
    };
  }, [open, placePrimaryMenu]);

  useLayoutEffect(() => {
    if (!open || !chooseOpen) return undefined;
    placeChooseMenu();
    window.addEventListener('resize', placeChooseMenu);
    window.addEventListener('scroll', placeChooseMenu, true);
    return () => {
      window.removeEventListener('resize', placeChooseMenu);
      window.removeEventListener('scroll', placeChooseMenu, true);
    };
  }, [open, chooseOpen, customViews.length, placeChooseMenu]);

  const saveView = () => {
    const name = window.prompt('Name this view:');
    if (!name?.trim()) return;
    try {
      const existing = loadCustomViews();
      existing.push({
        id: Date.now(),
        name: name.trim(),
        tab: activeTab || 'all',
        filters: filters || {},
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(existing.slice(-20)));
      setCustomViews(loadCustomViews());
      closeAll();
    } catch {
      window.alert('Could not save view.');
    }
  };

  const selectView = (view) => {
    onSelectView?.(view);
    closeAll();
  };

  const deleteCustomView = (view, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = loadCustomViews().filter((item) => item.id !== view.id);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    setCustomViews(next);
    if (activeViewId === customViewId(view)) {
      onSelectView?.(SAVED_VIEW_PRESETS[0]);
    }
  };

  const toolBtn =
    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors';
  const menuItemClass =
    'w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-left text-xs text-slate-700 rounded-md hover:bg-slate-50';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) closeAll();
          else setOpen(true);
        }}
        className={`${toolBtn} ${
          open || (activeViewId && activeViewId !== 'all')
            ? 'border-tf-blue/30 bg-blue-50/60 text-tf-blue'
            : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        View
      </button>

      {open &&
        createPortal(
          <>
            <div
              ref={menuRef}
              role="menu"
              style={{ top: menuCoords.top, left: menuCoords.left, width: PRIMARY_MENU_WIDTH }}
              className="fixed z-[80] rounded-lg border border-slate-200 bg-white shadow-xl p-1"
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={chooseOpen}
                onMouseEnter={openChoose}
                onMouseLeave={scheduleCloseChoose}
                onClick={openChoose}
                className={`${menuItemClass} ${chooseOpen ? 'bg-slate-50' : ''}`}
              >
                Choose
                <FaChevronRight className="w-2.5 h-2.5 text-slate-400 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={saveView}
                className={menuItemClass}
              >
                Save
              </button>
            </div>

            {chooseOpen && (
              <div
                ref={chooseRef}
                role="menu"
                style={{ top: chooseCoords.top, left: chooseCoords.left, width: CHOOSE_MENU_WIDTH }}
                className="fixed z-[81] rounded-lg border border-slate-200 bg-white shadow-xl p-1"
                onMouseEnter={openChoose}
                onMouseLeave={scheduleCloseChoose}
              >
                <div className="max-h-72 overflow-y-auto">
                  {SAVED_VIEW_PRESETS.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      role="menuitem"
                      onClick={() => selectView(view)}
                      className={menuItemClass}
                    >
                      <span className="truncate">{view.label}</span>
                      {activeViewId === view.id && (
                        <FaCheck className="w-2.5 h-2.5 text-tf-blue shrink-0" aria-hidden />
                      )}
                    </button>
                  ))}

                  {customViews.length > 0 && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Saved
                      </p>
                      {customViews.map((view) => (
                        <div key={view.id} className="group flex items-center rounded-md hover:bg-slate-50">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => selectView(toSelectable(view))}
                            className={`${menuItemClass} hover:bg-transparent flex-1 min-w-0`}
                          >
                            <span className="truncate">{view.name}</span>
                            {activeViewId === customViewId(view) && (
                              <FaCheck className="w-2.5 h-2.5 text-tf-blue shrink-0" aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => deleteCustomView(view, e)}
                            className="shrink-0 p-1.5 mr-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100"
                            aria-label={`Delete ${view.name}`}
                          >
                            <FaTimes className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </>,
          document.body
        )}
    </div>
  );
}
