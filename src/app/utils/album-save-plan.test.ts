import { describe, expect, it } from "vitest";
import {
  computeAlbumSavePlan,
  type SaveEditFieldsInput,
  type SaveSourceAlbumInput,
  type SaveFolderOption,
} from "./album-save-plan";

const folderOptions: SaveFolderOption[] = [
  { name: "Jazz", id: 2 },
  { name: "Uncategorized", id: 1 },
];

const baseAlbum: SaveSourceAlbumInput = {
  mediaCondition: "VG+",
  sleeveCondition: "VG+",
  notes: "",
  folder: "Uncategorized",
  folder_id: 1,
  customFields: [],
};

const baseFields: SaveEditFieldsInput = {
  mediaCondition: "VG+",
  sleeveCondition: "VG+",
  notes: "",
  folder: "Uncategorized",
  customFields: [],
};

describe("computeAlbumSavePlan", () => {
  it("needs neither write when nothing changed", () => {
    const plan = computeAlbumSavePlan(baseFields, baseAlbum, folderOptions);
    expect(plan.needsFolderMove).toBe(false);
    expect(plan.needsFieldWrite).toBe(false);
  });

  it("needs only a folder move when just the folder changed (M5 repro setup)", () => {
    const plan = computeAlbumSavePlan(
      { ...baseFields, folder: "Jazz" },
      baseAlbum,
      folderOptions
    );
    expect(plan.folderChanged).toBe(true);
    expect(plan.newFolderEntry).toEqual({ name: "Jazz", id: 2 });
    expect(plan.needsFolderMove).toBe(true);
    expect(plan.needsFieldWrite).toBe(false);
  });

  it("needs only a field write when just a condition changed", () => {
    const plan = computeAlbumSavePlan(
      { ...baseFields, mediaCondition: "NM" },
      baseAlbum,
      folderOptions
    );
    expect(plan.needsFolderMove).toBe(false);
    expect(plan.needsFieldWrite).toBe(true);
    expect(plan.fieldsChanged).toEqual({ mediaCondition: "NM" });
    expect(plan.conditionOrNotesChanged).toBe(true);
  });

  it("needs both writes when the folder and a condition both changed — the M5 scenario", () => {
    const plan = computeAlbumSavePlan(
      { ...baseFields, folder: "Jazz", notes: "Signed copy" },
      baseAlbum,
      folderOptions
    );
    expect(plan.needsFolderMove).toBe(true);
    expect(plan.newFolderEntry).toEqual({ name: "Jazz", id: 2 });
    expect(plan.needsFieldWrite).toBe(true);
    expect(plan.fieldsChanged).toEqual({ notes: "Signed copy" });
  });

  it("does not treat a folder change as a move when the target folder can't be resolved", () => {
    const plan = computeAlbumSavePlan(
      { ...baseFields, folder: "Some Deleted Folder" },
      baseAlbum,
      folderOptions
    );
    expect(plan.folderChanged).toBe(true);
    expect(plan.newFolderEntry).toBeUndefined();
    expect(plan.needsFolderMove).toBe(false);
  });

  it("detects a changed custom field, keyed to fieldId", () => {
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [{ name: "Price Paid", value: "10", fieldId: 5 }],
    };
    const plan = computeAlbumSavePlan(
      { ...baseFields, customFields: [{ name: "Price Paid", value: "15", fieldId: 5 }] },
      album,
      folderOptions
    );
    expect(plan.customFieldsChanged).toBe(true);
    expect(plan.changedCustomFields).toEqual([{ fieldId: 5, value: "15" }]);
    expect(plan.needsFieldWrite).toBe(true);
  });

  it("ignores a changed custom field with no fieldId", () => {
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [{ name: "Price Paid", value: "10" }],
    };
    const plan = computeAlbumSavePlan(
      { ...baseFields, customFields: [{ name: "Price Paid", value: "15" }] },
      album,
      folderOptions
    );
    expect(plan.customFieldsChanged).toBe(false);
    expect(plan.changedCustomFields).toEqual([]);
  });

  it("diffs correctly when a background sync reordered the original custom fields", () => {
    // The album's custom-field list arrived in a different order than the
    // form was seeded with — a positional diff would compare each edited
    // value against the wrong original and misattribute the write.
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [
        { name: "Notes", value: "unchanged notes", fieldId: 7 },
        { name: "Price Paid", value: "10", fieldId: 5 },
      ],
    };
    const plan = computeAlbumSavePlan(
      {
        ...baseFields,
        customFields: [
          { name: "Price Paid", value: "15", fieldId: 5 },
          { name: "Notes", value: "unchanged notes", fieldId: 7 },
        ],
      },
      album,
      folderOptions
    );
    expect(plan.changedCustomFields).toEqual([{ fieldId: 5, value: "15" }]);
    expect(plan.customFieldsChanged).toBe(true);
  });

  it("does not misattribute a write when the custom-field list grew mid-edit", () => {
    // A field was added to the collection's custom-field set (e.g. by a
    // background sync) while the form was open — the new field lands at the
    // end of the edited list with no original counterpart, and must not be
    // diffed against whatever originally sat at that index.
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [{ name: "Price Paid", value: "10", fieldId: 5 }],
    };
    const plan = computeAlbumSavePlan(
      {
        ...baseFields,
        customFields: [
          { name: "Price Paid", value: "10", fieldId: 5 }, // unchanged
          { name: "New Field", value: "hello", fieldId: 9 }, // no original counterpart
        ],
      },
      album,
      folderOptions
    );
    expect(plan.changedCustomFields).toEqual([]);
    expect(plan.customFieldsChanged).toBe(false);
  });

  it("does not misattribute a write when the custom-field list shrank mid-edit", () => {
    // The original list had two fields; the edited list (seeded before a
    // field was removed elsewhere) only carries one. A positional diff would
    // compare the surviving field against the wrong original by index.
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [
        { name: "Notes", value: "unchanged notes", fieldId: 7 },
        { name: "Price Paid", value: "10", fieldId: 5 },
      ],
    };
    const plan = computeAlbumSavePlan(
      { ...baseFields, customFields: [{ name: "Price Paid", value: "10", fieldId: 5 }] },
      album,
      folderOptions
    );
    expect(plan.changedCustomFields).toEqual([]);
    expect(plan.customFieldsChanged).toBe(false);
  });

  it("produces no write when every custom field is unchanged, reordered or not", () => {
    const album: SaveSourceAlbumInput = {
      ...baseAlbum,
      customFields: [
        { name: "Price Paid", value: "10", fieldId: 5 },
        { name: "Notes", value: "mint", fieldId: 7 },
      ],
    };
    const plan = computeAlbumSavePlan(
      {
        ...baseFields,
        customFields: [
          { name: "Notes", value: "mint", fieldId: 7 },
          { name: "Price Paid", value: "10", fieldId: 5 },
        ],
      },
      album,
      folderOptions
    );
    expect(plan.changedCustomFields).toEqual([]);
    expect(plan.customFieldsChanged).toBe(false);
    expect(plan.needsFieldWrite).toBe(false);
  });
});
