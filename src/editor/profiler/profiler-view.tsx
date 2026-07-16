import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { FrameProfile } from "../../engine/profiling/frame-profile";
import styles from "./profiler-view.module.scss";

/** One system's windowed average and its share of the whole update phase. */
type Row = Readonly<{
	label: string;
	group: string;
	avgMs: number;
	pct: number;
}>;

/** A 1Hz snapshot: rows plus the update-phase total they are shares of. */
type Snapshot = Readonly<{
	rows: ReadonlyArray<Row>;
	totalMs: number;
}>;

type SortKey = "system" | "avg";

const UNGROUPED = "Other";
const SAMPLE_INTERVAL_MS = 1000;

type Accumulator = {
	sums: Map<string, number>;
	groups: Map<string, string>;
	frames: number;
	target: FrameProfile | null;
};

const emptyAccumulator = (): Accumulator => ({
	sums: new Map(),
	groups: new Map(),
	frames: 0,
	target: null,
});

const snapshotOf = (acc: Accumulator): Snapshot | null => {
	if (acc.frames === 0 || acc.sums.size === 0) {
		return null;
	}
	const rows: Row[] = [];
	let totalMs = 0;
	for (const [label, sum] of acc.sums) {
		const avgMs = sum / acc.frames;
		totalMs += avgMs;
		rows.push({
			label,
			group: acc.groups.get(label) ?? UNGROUPED,
			avgMs,
			pct: 0,
		});
	}
	return {
		totalMs,
		rows: rows.map((row) => ({
			...row,
			pct: totalMs > 0 ? (row.avgMs / totalMs) * 100 : 0,
		})),
	};
};

/** Groups ordered by descending total time; rows within each by the sort key. */
const groupRows = (
	rows: ReadonlyArray<Row>,
	sort: SortKey,
	ascending: boolean,
): ReadonlyArray<readonly [string, ReadonlyArray<Row>]> => {
	const byGroup = new Map<string, Row[]>();
	for (const row of rows) {
		(
			byGroup.get(row.group) ??
			byGroup.set(row.group, []).get(row.group)!
		).push(row);
	}
	const dir = ascending ? 1 : -1;
	const sortRows = (list: Row[]): Row[] =>
		[...list].sort((a, b) =>
			sort === "system"
				? dir * a.label.localeCompare(b.label)
				: dir * (a.avgMs - b.avgMs),
		);
	return [...byGroup.entries()]
		.map(([group, list]) => {
			const total = list.reduce((sum, row) => sum + row.avgMs, 0);
			return [group, sortRows(list), total] as const;
		})
		.sort((a, b) => b[2] - a[2])
		.map(([group, list]) => [group, list] as const);
};

/**
 * Per-system Update breakdown for the last focused scene view's world.
 *
 * Accumulates each app frame's per-system self-times via its own rAF, then on a
 * 1Hz interval snapshots the windowed averages and renders them in a grouped,
 * sortable table. At 1Hz the 100µs timer clamp is statistically recovered. When
 * no scene view has been focused, `resolveProfile` returns `null` and an empty
 * state shows.
 */
const ProfilerView = ({
	resolveProfile,
}: Readonly<{ resolveProfile: () => FrameProfile | null }>) => {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [hasTarget, setHasTarget] = useState(false);
	const [sort, setSort] = useState<SortKey>("avg");
	const [ascending, setAscending] = useState(false);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const accRef = useRef<Accumulator>(emptyAccumulator());

	useEffect(() => {
		let raf = 0;
		const accumulate = (): void => {
			const acc = accRef.current;
			const profile = resolveProfile();
			if (profile !== acc.target) {
				acc.sums.clear();
				acc.groups.clear();
				acc.frames = 0;
				acc.target = profile;
			}
			if (profile) {
				for (const [label, ms] of profile.systemTimings) {
					acc.sums.set(label, (acc.sums.get(label) ?? 0) + ms);
					if (!acc.groups.has(label)) {
						const group = profile.groupOf(label);
						if (group !== undefined) {
							acc.groups.set(label, group);
						}
					}
				}
				acc.frames++;
			}
			raf = requestAnimationFrame(accumulate);
		};
		raf = requestAnimationFrame(accumulate);

		const interval = setInterval(() => {
			const acc = accRef.current;
			setHasTarget(acc.target !== null);
			setSnapshot(snapshotOf(acc));
			acc.sums.clear();
			acc.groups.clear();
			acc.frames = 0;
		}, SAMPLE_INTERVAL_MS);

		return () => {
			cancelAnimationFrame(raf);
			clearInterval(interval);
		};
	}, [resolveProfile]);

	if (!hasTarget) {
		return (
			<div className={styles.container}>
				<div className={styles.empty}>
					Focus a scene view to profile its systems.
				</div>
			</div>
		);
	}

	const onSort = (key: SortKey): void => {
		if (sort === key) {
			setAscending((prev) => !prev);
		} else {
			setSort(key);
			setAscending(key === "system");
		}
	};

	const toggle = (group: string): void =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (!next.delete(group)) {
				next.add(group);
			}
			return next;
		});

	const grouped = snapshot
		? groupRows(snapshot.rows, sort, ascending)
		: [];

	return (
		<div className={styles.container}>
			<table className={styles.table}>
				<thead>
					<tr>
						<th
							className={styles.name}
							onClick={() => onSort("system")}
						>
							System
						</th>
						<th onClick={() => onSort("avg")}>avg ms</th>
						<th>% of update</th>
					</tr>
				</thead>
				<tbody>
					{grouped.map(([group, rows]) => (
						<GroupBody
							key={group}
							group={group}
							rows={rows}
							expanded={expanded.has(group)}
							onToggle={() => toggle(group)}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
};

const GroupBody = ({
	group,
	rows,
	expanded,
	onToggle,
}: Readonly<{
	group: string;
	rows: ReadonlyArray<Row>;
	expanded: boolean;
	onToggle: () => void;
}>) => {
	const totalMs = rows.reduce((sum, row) => sum + row.avgMs, 0);
	const totalPct = rows.reduce((sum, row) => sum + row.pct, 0);
	return (
		<>
			<tr className={styles.groupRow} onClick={onToggle}>
				<td className={styles.name}>
					{expanded ? (
						<CaretDownIcon className={styles.caret} />
					) : (
						<CaretRightIcon className={styles.caret} />
					)}
					{group}
					<span className={styles.count}>{rows.length}</span>
				</td>
				<td>{totalMs.toFixed(2)}</td>
				<td className={styles.bar}>
					<span
						className={styles.barFill}
						style={{ transform: `scaleX(${totalPct / 100})` }}
					/>
					<span className={styles.barLabel}>
						{totalPct.toFixed(1)}%
					</span>
				</td>
			</tr>
			{expanded &&
				rows.map((row) => (
					<tr key={row.label} className={styles.systemRow}>
						<td className={styles.name}>{row.label}</td>
						<td>{row.avgMs.toFixed(3)}</td>
						<td className={styles.bar}>
							<span
								className={styles.barFill}
								style={{ transform: `scaleX(${row.pct / 100})` }}
							/>
							<span className={styles.barLabel}>
								{row.pct.toFixed(1)}%
							</span>
						</td>
					</tr>
				))}
		</>
	);
};

export default ProfilerView;
