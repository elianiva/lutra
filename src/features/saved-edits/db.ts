import { type Layer } from "../editor/chain/types";

export type SavedEdit = {
  id: number;
  source_path: string;
  preview_path: string;
  chain: Layer[];
  thumbnail_path: string;
  created_at: string;
};

/** Raw row shape from SQLite — `chain` is a JSON string before parsing. */
export type SavedEditRow = {
  id: number;
  source_path: string;
  preview_path: string;
  chain: string;
  thumbnail_path: string;
  created_at: string;
};

export function parseSavedEdit(row: SavedEditRow): SavedEdit {
  return { ...row, chain: JSON.parse(row.chain) as Layer[] };
}

export const editKeys = {
  all: ["edits"] as const,
  detail: (id: number) => ["edits", id] as const,
};
