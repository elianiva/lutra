# Transactional layer addition

New adjustment layers are added via a draft/confirm flow instead of being committed immediately. The user selects a tool, adjusts it in a preview state, then explicitly confirms to add it to the edit chain. Cancelling or navigating away discards the draft silently.

This was a real trade-off. The alternative — immediate addition (current behavior) — is simpler but creates friction: users must manually delete unwanted layers after trying them. For a color-grading app where experimentation is the core loop, the cost of "oops, remove that" adds up. The transactional flow makes experimentation free.

The constraint is that the draft blocks other editor interactions (layer drawer, tool selection) until resolved. This is intentional: mixing draft state with other mutations would create ambiguous persistence rules. The draft is a focused, modal editing state.

Existing layer edits remain auto-save (no confirm step). The distinction is clear: new = transactional, existing = immediate. The UI signals this via the top bar — confirm/cancel for drafts, back-as-done for existing edits.
