/**
 * Pure decision logic for album-detail's edit-mode Save: given the edit form,
 * the album it was seeded from, and the available folders, work out which of
 * the two possible Discogs writes (folder move, field/custom-field update)
 * are actually needed. Extracted from `handleSave` in `album-detail.tsx` so
 * the "what needs to be sent" question is testable without React (see M5:
 * a folder move that lands on Discogs must be committed to local state/cache
 * immediately, independent of whether the field write that follows it
 * succeeds — see CLAUDE.md's Album Detail Edit Mode / Reactive hydration).
 */

export interface SaveFolderOption {
  name: string;
  id: number;
}

export interface SaveEditFieldsInput {
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
  folder: string;
  customFields: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
}

export interface SaveSourceAlbumInput {
  mediaCondition?: string;
  sleeveCondition?: string;
  notes?: string;
  folder?: string;
  folder_id: number;
  customFields?: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
}

export interface ChangedCustomField {
  fieldId: number;
  value: string;
}

export interface AlbumSavePlan {
  /** true if the folder dropdown was changed to a folder that actually resolves. */
  folderChanged: boolean;
  /** The resolved target folder, if `folderChanged` and it matches a known folder. */
  newFolderEntry: SaveFolderOption | undefined;
  /** true when a move needs to be sent to Discogs (folderChanged && newFolderEntry). */
  needsFolderMove: boolean;
  /** Condition/notes fields that differ from the seeded album, keyed for the proxy call. */
  fieldsChanged: { mediaCondition?: string; sleeveCondition?: string; notes?: string };
  /** true if any of mediaCondition/sleeveCondition/notes changed. */
  conditionOrNotesChanged: boolean;
  /** Custom fields whose value changed, in the {fieldId, value} shape the proxy expects. */
  changedCustomFields: ChangedCustomField[];
  /** true if any custom field changed. */
  customFieldsChanged: boolean;
  /** true when a field/custom-field write needs to be sent to Discogs. */
  needsFieldWrite: boolean;
}

export function computeAlbumSavePlan(
  editFields: SaveEditFieldsInput,
  selectedAlbum: SaveSourceAlbumInput,
  folderOptions: SaveFolderOption[]
): AlbumSavePlan {
  const fieldsChanged: { mediaCondition?: string; sleeveCondition?: string; notes?: string } = {};
  let conditionOrNotesChanged = false;

  if (editFields.mediaCondition !== selectedAlbum.mediaCondition) {
    fieldsChanged.mediaCondition = editFields.mediaCondition;
    conditionOrNotesChanged = true;
  }
  if (editFields.sleeveCondition !== selectedAlbum.sleeveCondition) {
    fieldsChanged.sleeveCondition = editFields.sleeveCondition;
    conditionOrNotesChanged = true;
  }
  if (editFields.notes !== selectedAlbum.notes) {
    fieldsChanged.notes = editFields.notes;
    conditionOrNotesChanged = true;
  }

  // Diff by fieldId, not by array position. If a background sync lands while
  // the edit sheet is open, the album's custom-field list can reorder or
  // change length under the form — a positional diff would then compare an
  // edited value against the WRONG original field and attach it to the wrong
  // fieldId, writing to the wrong Discogs field. A field with no fieldId (or
  // no counterpart in the original list) is skipped, exactly as before.
  const origByFieldId = new Map<number, { value: string }>();
  for (const f of selectedAlbum.customFields || []) {
    if (f.fieldId != null) origByFieldId.set(f.fieldId, f);
  }
  const changedCustomFields: ChangedCustomField[] = [];
  for (const edited of editFields.customFields) {
    if (!edited.fieldId) continue;
    const orig = origByFieldId.get(edited.fieldId);
    if (orig && edited.value !== orig.value) {
      changedCustomFields.push({ fieldId: edited.fieldId, value: edited.value });
    }
  }
  const customFieldsChanged = changedCustomFields.length > 0;

  const folderChanged = editFields.folder !== selectedAlbum.folder;
  const newFolderEntry = folderOptions.find((f) => f.name === editFields.folder);

  return {
    folderChanged,
    newFolderEntry,
    needsFolderMove: folderChanged && !!newFolderEntry,
    fieldsChanged,
    conditionOrNotesChanged,
    changedCustomFields,
    customFieldsChanged,
    needsFieldWrite: conditionOrNotesChanged || customFieldsChanged,
  };
}
