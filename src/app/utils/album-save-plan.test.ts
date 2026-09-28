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

  it("detects a changed custom field by position, keyed to fieldId", () => {
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
});
