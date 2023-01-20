import {
	createContext,
	Dispatch,
	ReactNode,
	SetStateAction,
	useContext,
	useState,
} from "react";

const PersistenceContext = createContext<(key: string, value: any) => void>(
	() => {}
);

export const Persistence = ({ children }: { children?: ReactNode }) => {
	const [, forceUpdate] = useState(false);

	const commit = () => forceUpdate(x => !x);

	const set = (key: string, value: SetStateAction<any>) => {
		if (value === null || value === undefined) {
			localStorage.removeItem(key);
			commit();
			return;
		}

		const valueToStore =
			value instanceof Function
				? value(JSON.parse(localStorage.getItem(key)!))
				: value;

		localStorage.setItem(key, JSON.stringify(valueToStore));
		commit();
	};

	return (
		<PersistenceContext.Provider value={set}>
			{children}
		</PersistenceContext.Provider>
	);
};

function usePersistence<T>(
	key: string
): readonly [T | undefined, Dispatch<SetStateAction<T | undefined>>];
function usePersistence<T>(
	key: string,
	defaultValue: T
): readonly [T, React.Dispatch<React.SetStateAction<T>>];
function usePersistence<T>(...args: any[]): any {
	const [key, defaultValue] = args;
	const setState = useContext(PersistenceContext);

	if (
		defaultValue !== null &&
		defaultValue !== undefined &&
		!localStorage.getItem(key)
	) {
		localStorage.setItem(key, JSON.stringify(defaultValue));
	}

	const set = (value: SetStateAction<T>) => setState(key, value);

	return [JSON.parse(localStorage.getItem(key)!) as T, set] as const;
}

export default usePersistence;
