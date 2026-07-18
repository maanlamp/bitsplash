import { useEffect, useState } from "react";
import {
	consoleHistory,
	subscribeConsole,
	type ConsoleEntry,
} from "../console";

const Console = () => {
	const [logs, setLogs] =
		useState<ReadonlyArray<ConsoleEntry>>(consoleHistory);
	useEffect(() => {
		return subscribeConsole((entry) => {
			// In order to allow logging anything at any time,
			// such as mid-render, this component cannot
			// trigger a setstate immediately when it recieves
			// a console message, it needs to defer to next tick.
			// TODO: Figure out a nicer way to do this
			setTimeout(() => {
				setLogs((prev) => prev.concat(entry));
			});
		});
	}, []);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				overflow: "hidden auto",
				height: "100%",
				padding: "0 1rem 1rem 1rem",
			}}
		>
			{logs.map((log, i) => (
				<div key={i} style={{ display: "flex", gap: ".5rem" }}>
					<p
						style={{
							display: "flex",
							gap: ".5rem",
							flex: 1,
							color: (() => {
								switch (log.level) {
									case "error":
										return "red";
									case "warn":
										return "orange";
									default:
										return undefined;
								}
							})(),
						}}
					>
						{log.args.map((arg, i) => (
							<span key={i}>{JSON.stringify(arg, null, 2)}</span>
						))}
					</p>
					<time
						dateTime={log.timestamp.toISOString()}
						style={{ opacity: 0.5 }}
					>
						{log.timestamp.toISOString()}
					</time>
				</div>
			))}
		</div>
	);
};

export default Console;
