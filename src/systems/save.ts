import { defaultLoadout, sanitizeLoadout, type LoadoutChoice } from "../config/loadouts";

const KEY = "gyrefall.save.v1";

export interface SaveData {
  loadout: LoadoutChoice;
  /** A name the player typed. Null means keep following the OpenGame handle. */
  name: string | null;
}

/** localStorage can be missing, full or blocked. The game must work either way. */
export const loadSave = (): SaveData => {
  const fallback: SaveData = { loadout: defaultLoadout(), name: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<SaveData> | null;
    return {
      loadout: sanitizeLoadout(data?.loadout),
      name: typeof data?.name === "string" && data.name.trim() ? data.name.slice(0, 20) : null,
    };
  } catch {
    return fallback;
  }
};

export const writeSave = (data: SaveData): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nothing to do. The choice still applies for this session.
  }
};
