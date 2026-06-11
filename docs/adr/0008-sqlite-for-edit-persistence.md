# SQLite for edit persistence

The main menu is now a grid of saved edits. Each saved edit stores a source image, edit chain, and thumbnail. We chose SQLite (via `expo-sqlite`) over MMKV for the metadata layer, with `expo-file-system` for image files.

MMKV was considered — it's faster for simple key-value reads and already common in React Native apps. We picked SQLite anyway because the grid will eventually need queries (sort by date, filter by chain complexity, search by image metadata) and because the options screen needs aggregate stats (edit count, total storage). MMKV would force us to iterate all keys and deserialize each value to answer those questions. SQLite gives us indexed queries from day one, and the overhead is negligible for a write-once-read-many workload.

Auto-save on editor exit means the persistence layer is always the source of truth, never the in-memory stores. The in-memory stores (`imageStore`, `chainStore`) are session-scoped — loaded on edit resume, cleared on back. This is a hard break from v1 where back discarded the session.
