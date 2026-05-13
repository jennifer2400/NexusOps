"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const NavContext = createContext({
  isOpen: false,
  isCollapsed: false,
  toggle: () => {},
  close: () => {},
  toggleCollapsed: () => {},
});

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
    setIsInitialized(true);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed));
    }
  }, [isCollapsed, isInitialized]);

  const toggle = () => setIsOpen(!isOpen);
  const close = () => setIsOpen(false);
  const toggleCollapsed = () => setIsCollapsed(!isCollapsed);

  return (
    <NavContext.Provider value={{ isOpen, isCollapsed, toggle, close, toggleCollapsed }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
