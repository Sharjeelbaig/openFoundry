import { createContext, useContext } from "react";
import type { AppData } from "./types";

export interface AppContextValue {
  data: AppData;
  refresh: () => Promise<void>;
  updateSettings: (data: AppData) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppContext");
  return value;
}
