import type { History } from "../history";
import {
	deleteEntry,
	makeDir,
	renameEntry,
	restoreEntry,
} from "../project-io";
import { toastError } from "../toast";

export const baseName = (p: string): string =>
	p.split(/[\\/]/).pop() ?? p;

export const dirName = (p: string): string => {
	const match = p.search(/[\\/][^\\/]*$/);
	return match === -1 ? p : p.slice(0, match);
};

export const joinPath = (dir: string, name: string): string => {
	const sep = dir.includes("\\") ? "\\" : "/";
	return `${dir}${sep}${name}`;
};

export const uniqueName = (
	name: string,
	existing: ReadonlySet<string>,
): string => {
	if (!existing.has(name)) {
		return name;
	}
	const dot = name.indexOf(".");
	const stem = dot === -1 ? name : name.slice(0, dot);
	const ext = dot === -1 ? "" : name.slice(dot);
	for (let n = 2; ; n++) {
		const candidate = `${stem} ${n}${ext}`;
		if (!existing.has(candidate)) {
			return candidate;
		}
	}
};

const mustRename = async (
	path: string,
	newName: string,
): Promise<string> => {
	const result = await renameEntry(path, newName);
	if (!result.renamed) {
		toastError(`Couldn't rename to "${newName}"`);
		throw new Error("rename failed");
	}
	return result.path;
};

export const renameAsset = async (
	history: History,
	path: string,
	newName: string,
	refresh: () => void,
): Promise<boolean> => {
	const result = await renameEntry(path, newName);
	if (!result.renamed) {
		toastError(`"${newName}" already exists`);
		return false;
	}
	const newPath = result.path;
	const oldName = baseName(path);
	refresh();
	history.push({
		undo: async () => {
			await mustRename(newPath, oldName);
			refresh();
		},
		redo: async () => {
			await mustRename(path, newName);
			refresh();
		},
	});
	return true;
};

export const deleteAsset = async (
	history: History,
	path: string,
	refresh: () => void,
): Promise<void> => {
	let token = await deleteEntry(path);
	refresh();
	history.push({
		undo: async () => {
			await restoreEntry(token);
			refresh();
		},
		redo: async () => {
			token = await deleteEntry(path);
			refresh();
		},
	});
};

export const createFolder = async (
	history: History,
	parent: string,
	name: string,
	refresh: () => void,
): Promise<string> => {
	const created = await makeDir(parent, name);
	const path = created.path;
	refresh();
	history.push({
		undo: async () => {
			await deleteEntry(path);
			refresh();
		},
		redo: async () => {
			await makeDir(parent, name);
			refresh();
		},
	});
	return path;
};
