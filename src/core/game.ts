type Component<T extends {}> = () => T;

type Entity = Readonly<{ id: number }> & { [key: string]: any };

type System = (e: Entity, delta: number) => void;

type Layer = {
	entities: Entity[];
};

// https://github.com/hackergrrl/recs

let LAST_ID = -1;
const Game = () => {
	let entityStoreIsDirty = false;
	const entityStore: Record<
		string,
		{
			destroyed: boolean;
			components: ReadonlyArray<Component<any>>;
			entity: Entity;
			events: { [event: string]: (e: Entity) => void };
		}
	> = {};
	let systemStoreIsDirty = false;
	const systemStore: Record<
		string,
		{ components: ReadonlyArray<Component<any>>; system: System }
	> = {};

	const entities = {
		create: <T extends { [key: string]: any }>(
			components: ReadonlyArray<Component<{}>>,
			init?: (e: T) => void
		) => {
			const id = ++LAST_ID;
			const e: Entity = { id };
			for (const c of components) e[c.name] = c();
			init?.(e as any);
			entityStore[id] = {
				components,
				destroyed: false,
				entity: e,
				events: {},
			};
			entityStoreIsDirty = true;
			return id;
		},
		destroy: (id: number) => {
			entityStore[id].destroyed = true;
		},
		on: (
			event: string,
			components: ReadonlyArray<Component<any>>,
			handler: (e: Entity) => void
		) => {
			for (const e of Object.values(entityStore)) {
				if (components.every(c => c.name in e.entity)) {
					e.events[event] = handler;
				}
			}
		},
		send: (event: string, components: ReadonlyArray<Component<any>>) => {
			for (const e of Object.values(entityStore)) {
				if (components.every(c => c.name in e.entity)) {
					e.events[event](e.entity);
				}
			}
		},
	};

	const systems = {
		create: (
			components: ReadonlyArray<Component<{}>>,
			system: (e: Entity) => void
		) => {
			const id = ++LAST_ID;
			systemStore[id] = { system, components };
			systemStoreIsDirty = true;
			return id;
		},
	};

	const loop = () => {
		let now = 0;
		let before = 0;
		let delta = 0;
		let entities = Object.entries(entityStore);
		let systems = Object.values(systemStore);

		const tick = () => {
			now = performance.now();
			delta = now - before;
			before = now;

			if (entityStoreIsDirty) {
				entities = Object.entries(entityStore);
				entityStoreIsDirty = false;
			}
			if (systemStoreIsDirty) {
				systems = Object.values(systemStore);
				systemStoreIsDirty = false;
			}

			renderer.context.clearRect(0, 0, viewport.width, viewport.height);
			for (const [k, e] of entities) {
				for (const s of systems) {
					if (s.components.every(c => c.name in e.entity)) {
						s.system(e.entity, delta);
					}
				}
				if (e.destroyed) {
					delete entityStore[k];
					entityStoreIsDirty = true;
				}
			}

			requestAnimationFrame(tick);
		};
		tick();
	};

	const viewport = document.createElement("canvas");
	const context = viewport.getContext("2d");
	if (!context) {
		throw new Error("Could not get game viewport context.");
	}
	const renderer = {
		viewport,
		context,
	};

	return {
		entities,
		systems,
		renderer,
		loop,
	};
};

export default Game;
