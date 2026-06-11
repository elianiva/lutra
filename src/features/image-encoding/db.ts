import { type Layer } from "../image-processing/chain/types";

export type SavedEdit = {
	id: number;
	source_path: string;
	preview_path: string;
	chain: Layer[];
	thumbnail_path: string;
	created_at: string;
};

/**
 * Parse a saved edit row from SQLite into a typed SavedEdit.
 */
export function parseSavedEdit(row: {
	id: number;
	source_path: string;
	preview_path: string;
	chain: string;
	thumbnail_path: string;
	created_at: string;
}): SavedEdit {
	return {
		...row,
		chain: JSON.parse(row.chain) as Layer[],
	};
}
