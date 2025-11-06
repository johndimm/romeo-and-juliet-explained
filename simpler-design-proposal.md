# Simpler Note Box Design Proposal

## Current Problems

The current implementation has grown complex with multiple states:
- `expandedNotes` - tracks which notes are expanded
- `suppressedNotes` - tracks which notes are hidden
- `noteInSelectMode` - tracks which note allows text selection
- Multiple rendering paths for different states
- Complex filtering logic for saved explanations
- Fighting against the original design

## Proposed Simpler Design

### Core Concept: Single "Open/Closed" State

Instead of three states (hidden/collapsed/expanded), use just two:
- **Closed**: Note box is hidden, nothing shows
- **Open**: Note box shows everything (note, chat, explanations)

### State Management

**Remove:**
- `expandedNotes` Set
- `noteInSelectMode` 

**Keep/Simplify:**
- `suppressedNotes` Set - tracks which notes are closed/hidden
  - When note is in this set, it's closed
  - When note is NOT in this set, it's open

### User Flow

1. **Click speech with note** → Note box opens (remove from `suppressedNotes`)
2. **Click speech again when note is open** → Note box closes (add to `suppressedNotes`)
3. **Click note content** → No effect (or could toggle, but let's keep it simple)

### Rendering Logic

```
if (note is suppressed) {
  // Don't render aside at all
  return null;
}

// Note is open - render everything:
- Note content
- Instructions (if applicable)
- Chat input + Ask + More buttons
- All explanations (More, Chat Prompt, Selected Text)
```

### Text Selection

- When note is open, text selection is always enabled for that speech
- No separate "select mode" state needed
- Selection creates explanations that appear below chat UI

### Explanation Types

Each explanation has a clear type stored in metadata:
- `type: 'selected-text'` → Title: "Selected Text"
- `type: 'more'` → Title: "More"  
- `type: 'chat-prompt'` → Title: "Chat Prompt"

### Benefits

1. **Simpler state** - One boolean concept (open/closed) instead of multiple states
2. **Clearer logic** - No conditional rendering based on multiple states
3. **Easier to debug** - Single source of truth for visibility
4. **Less code** - Remove ~200+ lines of conditional logic
5. **More maintainable** - Future changes easier to implement

### Implementation Changes

1. Remove `expandedNotes` state and all related logic
2. Remove `noteInSelectMode` state  
3. Simplify `hasAside` - just check if note is suppressed
4. Remove conditional rendering based on `isNoteExpanded`
5. Always show chat UI when note is open
6. Always enable text selection when note is open
7. Store explanation type in metadata when saving

### Migration Path

1. Replace `expandedNotes.has(speechKey)` checks with `!suppressedNotes.has(speechKey)`
2. Remove click handler on note content (or make it no-op)
3. Simplify all panel rendering conditions
4. Update saved explanation metadata to include type

