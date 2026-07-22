/**
 * A focused reader for the **MS-NRBF** (.NET Binary Remoting Format) object
 * graph that paint.NET's `.pdn` files wrap around their `Document`. It is *not*
 * a general-purpose `BinaryFormatter` — it implements exactly the record set a
 * paint.NET document exercises (classes with typed members, object/primitive/
 * string arrays, string and reference records, and the null run-lengths that
 * pad `ArrayList` backing stores) — enough to walk to the layer list, each
 * layer's properties, and each surface's dimensions. The bulky pixel scan0 is
 * **not** in the NRBF stream: it is deferred data appended after
 * {@link readNrbf} returns (see `pdn-import.ts`); this reader only surfaces
 * where the stream ends so the caller can resume there.
 *
 * All NRBF structural integers are little-endian, per MS-NRBF.
 *
 * @see https://learn.microsoft.com/openspecs/windows_protocols/ms-nrbf — the
 * public specification this mirrors.
 */

/** A parsed class instance: its .NET type name plus its members by name. */
export type NrbfObject = {
	readonly __class: string;
	readonly members: Record<string, NrbfValue>;
};

/** Any value the reader can yield for a member or array element. */
export type NrbfValue =
	| NrbfObject
	| NrbfValue[]
	| string
	| number
	| bigint
	| boolean
	| null;

/** The fully-resolved result of {@link readNrbf}. */
export type NrbfResult = Readonly<{
	/** The root object of the graph (paint.NET's `Document`). */
	root: NrbfObject;
	/** Byte offset one past the NRBF `MessageEnd` — where deferred data begins. */
	end: number;
}>;

enum RecordType {
	SerializedStreamHeader = 0,
	ClassWithId = 1,
	SystemClassWithMembers = 2,
	ClassWithMembers = 3,
	SystemClassWithMembersAndTypes = 4,
	ClassWithMembersAndTypes = 5,
	BinaryObjectString = 6,
	BinaryArray = 7,
	MemberPrimitiveTyped = 8,
	MemberReference = 9,
	ObjectNull = 10,
	MessageEnd = 11,
	BinaryLibrary = 12,
	ObjectNullMultiple256 = 13,
	ObjectNullMultiple = 14,
	ArraySinglePrimitive = 15,
	ArraySingleObject = 16,
	ArraySingleString = 17,
}

enum BinaryType {
	Primitive = 0,
	String = 1,
	Object = 2,
	SystemClass = 3,
	Class = 4,
	ObjectArray = 5,
	StringArray = 6,
	PrimitiveArray = 7,
}

enum Primitive {
	Boolean = 1,
	Byte = 2,
	Char = 3,
	Decimal = 5,
	Double = 6,
	Int16 = 7,
	Int32 = 8,
	Int64 = 9,
	SByte = 10,
	Single = 11,
	TimeSpan = 12,
	DateTime = 13,
	UInt16 = 14,
	UInt32 = 15,
	UInt64 = 16,
	Null = 17,
	String = 18,
}

/** A forward/backward object-id reference, resolved after the whole graph reads. */
class Ref {
	constructor(readonly id: number) {}
}

/** A leaf value: the same in the building and resolved trees. */
type Scalar = string | number | bigint | boolean | null;

/**
 * A value as read but *before* reference resolution — a scalar, a
 * {@link BuildObject}, a nested array, or an unresolved {@link Ref}. After
 * {@link NrbfReader.resolveReferences} every `Ref` has been replaced, so the
 * root is cast to the public {@link NrbfValue} tree once resolution completes.
 */
type Node = BuildObject | Node[] | Scalar | Ref;

/** A class instance under construction — its members may still hold {@link Ref}s. */
type BuildObject = { __class: string; members: Record<string, Node> };

type MemberSpec = Readonly<{
	binaryType: BinaryType;
	primitive?: Primitive;
}>;

type ClassMeta = Readonly<{
	name: string;
	memberNames: readonly string[];
	members: readonly MemberSpec[];
}>;

/**
 * Deserialize the NRBF object graph starting at `offset` in `bytes`, returning
 * the fully reference-resolved root object and the offset where the stream
 * ended (the start of paint.NET's deferred surface data).
 *
 * @throws if a record type the paint.NET document set never uses is
 * encountered, or the stream is malformed.
 */
export const readNrbf = (
	bytes: Uint8Array,
	offset: number,
): NrbfResult => {
	const reader = new NrbfReader(bytes, offset);
	return reader.read();
};

class NrbfReader {
	private readonly view: DataView;
	private pos: number;
	private readonly objectsById = new Map<
		number,
		BuildObject | Node[]
	>();
	private readonly classById = new Map<number, ClassMeta>();
	private readonly stringHolders = new WeakSet<object>();
	private rootId = 0;

	constructor(
		private readonly bytes: Uint8Array,
		offset: number,
	) {
		this.view = new DataView(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength,
		);
		this.pos = offset;
	}

	read(): NrbfResult {
		if (this.u8() !== RecordType.SerializedStreamHeader) {
			throw new Error("Not an NRBF stream (missing header record).");
		}
		this.rootId = this.i32();
		this.i32(); // headerId
		const major = this.i32();
		this.i32(); // minor
		if (major !== 1) {
			throw new Error(`Unsupported NRBF major version ${major}.`);
		}

		while (true) {
			const record = this.u8();
			if (record === RecordType.MessageEnd) {
				break;
			}
			this.pos -= 1;
			this.readRecord();
		}

		this.resolveReferences();
		const root = this.objectsById.get(this.rootId);
		if (!root || Array.isArray(root)) {
			throw new Error("NRBF root object is missing or not a class.");
		}
		// References are resolved, so no Ref remains: the graph is a valid
		// NrbfValue tree.
		return { root: root as unknown as NrbfObject, end: this.pos };
	}

	/** Read one record at the cursor and return the value it denotes. */
	private readRecord(): Node {
		const record = this.u8();
		switch (record) {
			case RecordType.ClassWithId:
				return this.readClassWithId();
			case RecordType.SystemClassWithMembersAndTypes:
				return this.readClassWithMembersAndTypes(true);
			case RecordType.ClassWithMembersAndTypes:
				return this.readClassWithMembersAndTypes(false);
			case RecordType.BinaryObjectString:
				return this.readBinaryObjectString();
			case RecordType.BinaryArray:
				return this.readBinaryArray();
			case RecordType.MemberReference:
				return new Ref(this.i32());
			case RecordType.ObjectNull:
				return null;
			case RecordType.BinaryLibrary:
				this.i32();
				this.readString();
				return this.readRecord();
			case RecordType.ArraySinglePrimitive:
				return this.readArraySinglePrimitive();
			case RecordType.ArraySingleObject:
				return this.readArraySingleObject();
			case RecordType.ArraySingleString:
				return this.readArraySingleString();
			case RecordType.MemberPrimitiveTyped:
				return this.readMemberPrimitiveTyped();
			default:
				throw new Error(
					`Unsupported NRBF record type ${record} at offset ${this.pos - 1}.`,
				);
		}
	}

	private readClassInfo(): {
		objectId: number;
		name: string;
		memberNames: string[];
	} {
		const objectId = this.i32();
		const name = this.readString();
		const count = this.i32();
		const memberNames: string[] = [];
		for (let i = 0; i < count; i++) {
			memberNames.push(this.readString());
		}
		return { objectId, name, memberNames };
	}

	private readMemberTypeInfo(count: number): MemberSpec[] {
		const binaryTypes: BinaryType[] = [];
		for (let i = 0; i < count; i++) {
			binaryTypes.push(this.u8() as BinaryType);
		}
		const members: MemberSpec[] = [];
		for (const binaryType of binaryTypes) {
			switch (binaryType) {
				case BinaryType.Primitive:
				case BinaryType.PrimitiveArray:
					members.push({ binaryType, primitive: this.u8() });
					break;
				case BinaryType.SystemClass:
					this.readString();
					members.push({ binaryType });
					break;
				case BinaryType.Class:
					this.readString();
					this.i32(); // libraryId
					members.push({ binaryType });
					break;
				default:
					members.push({ binaryType });
			}
		}
		return members;
	}

	private readClassWithMembersAndTypes(system: boolean): BuildObject {
		const info = this.readClassInfo();
		const members = this.readMemberTypeInfo(info.memberNames.length);
		if (!system) {
			this.i32(); // libraryId
		}
		const meta: ClassMeta = {
			name: info.name,
			memberNames: info.memberNames,
			members,
		};
		this.classById.set(info.objectId, meta);
		return this.readClassMembers(info.objectId, meta);
	}

	private readClassWithId(): BuildObject {
		const objectId = this.i32();
		const metadataId = this.i32();
		const meta = this.classById.get(metadataId);
		if (!meta) {
			throw new Error(
				`ClassWithId references unknown metadata id ${metadataId}.`,
			);
		}
		return this.readClassMembers(objectId, meta);
	}

	private readClassMembers(
		objectId: number,
		meta: ClassMeta,
	): BuildObject {
		const members: Record<string, Node> = {};
		const obj: BuildObject = { __class: meta.name, members };
		this.objectsById.set(objectId, obj);
		for (let i = 0; i < meta.members.length; i++) {
			members[meta.memberNames[i]!] = this.readMemberValue(
				meta.members[i]!,
			);
		}
		return obj;
	}

	/**
	 * Read one member: a primitive-typed member is stored inline (its bytes
	 * follow directly); every other binary type is a nested record.
	 */
	private readMemberValue(spec: MemberSpec): Node {
		if (spec.binaryType === BinaryType.Primitive) {
			return this.readPrimitive(spec.primitive!);
		}
		return this.readRecord();
	}

	private readBinaryObjectString(): string {
		const objectId = this.i32();
		const value = this.readString();
		// Strings are value-like; register a boxed holder (tracked so a
		// MemberReference to this id resolves back to the bare string).
		const holder: Node[] = [value];
		this.stringHolders.add(holder);
		this.objectsById.set(objectId, holder);
		return value;
	}

	private readArrayInfo(): { objectId: number; length: number } {
		return { objectId: this.i32(), length: this.i32() };
	}

	private readArraySinglePrimitive(): Node[] {
		const { objectId, length } = this.readArrayInfo();
		const primitive = this.u8() as Primitive;
		const items: Node[] = [];
		for (let i = 0; i < length; i++) {
			items.push(this.readPrimitive(primitive));
		}
		this.objectsById.set(objectId, items);
		return items;
	}

	private readArraySingleObject(): Node[] {
		const { objectId, length } = this.readArrayInfo();
		const items = this.readObjectItems(length);
		this.objectsById.set(objectId, items);
		return items;
	}

	private readArraySingleString(): Node[] {
		const { objectId, length } = this.readArrayInfo();
		const items = this.readObjectItems(length);
		this.objectsById.set(objectId, items);
		return items;
	}

	private readBinaryArray(): Node[] {
		const objectId = this.i32();
		const arrayType = this.u8();
		const rank = this.i32();
		let length = 1;
		const lengths: number[] = [];
		for (let i = 0; i < rank; i++) {
			const dim = this.i32();
			lengths.push(dim);
			length *= dim;
		}
		// Offset array types (3,4,5) carry lower bounds; paint.NET never emits
		// them, but honor the layout so we stay in sync if one appears.
		if (arrayType === 3 || arrayType === 4 || arrayType === 5) {
			for (let i = 0; i < rank; i++) {
				this.i32();
			}
		}
		const [spec] = this.readMemberTypeInfo(1);
		const items: Node[] = [];
		if (spec!.binaryType === BinaryType.Primitive) {
			for (let i = 0; i < length; i++) {
				items.push(this.readPrimitive(spec!.primitive!));
			}
		} else {
			items.push(...this.readObjectItems(length));
		}
		this.objectsById.set(objectId, items);
		return items;
	}

	/**
	 * Read `length` object/string array elements, expanding the null run-length
	 * records (`ObjectNullMultiple*`) that pad `ArrayList` backing arrays.
	 */
	private readObjectItems(length: number): Node[] {
		const items: Node[] = [];
		while (items.length < length) {
			const record = this.u8();
			if (record === RecordType.ObjectNull) {
				items.push(null);
			} else if (record === RecordType.ObjectNullMultiple256) {
				const n = this.u8();
				for (let i = 0; i < n; i++) {
					items.push(null);
				}
			} else if (record === RecordType.ObjectNullMultiple) {
				const n = this.i32();
				for (let i = 0; i < n; i++) {
					items.push(null);
				}
			} else {
				this.pos -= 1;
				items.push(this.readRecord());
			}
		}
		return items;
	}

	private readMemberPrimitiveTyped(): Scalar {
		const primitive = this.u8() as Primitive;
		return this.readPrimitive(primitive);
	}

	private readPrimitive(type: Primitive): Scalar {
		switch (type) {
			case Primitive.Boolean:
				return this.u8() !== 0;
			case Primitive.Byte:
				return this.u8();
			case Primitive.SByte:
				return (this.u8() << 24) >> 24;
			case Primitive.Int16:
				return this.i16();
			case Primitive.UInt16:
				return this.u16();
			case Primitive.Int32:
				return this.i32();
			case Primitive.UInt32:
				return this.view.getUint32((this.pos += 4) - 4, true);
			case Primitive.Int64:
			case Primitive.TimeSpan:
				return this.i64();
			case Primitive.UInt64:
			case Primitive.DateTime:
				return this.u64();
			case Primitive.Single:
				return this.view.getFloat32((this.pos += 4) - 4, true);
			case Primitive.Double:
				return this.view.getFloat64((this.pos += 8) - 8, true);
			case Primitive.Char:
				return this.readChar();
			case Primitive.Decimal:
			case Primitive.String:
				return this.readString();
			default:
				throw new Error(`Unsupported NRBF primitive type ${type}.`);
		}
	}

	/** Replace every {@link Ref} in the registry with the object it names. */
	private resolveReferences(): void {
		const deref = (value: Node): Node => {
			if (value instanceof Ref) {
				const target = this.objectsById.get(value.id);
				if (target === undefined) {
					throw new Error(
						`NRBF reference ${value.id} could not be resolved.`,
					);
				}
				// String holders are boxed as a 1-element array.
				if (Array.isArray(target) && this.stringHolders.has(target)) {
					return target[0]!;
				}
				return target as unknown as Node;
			}
			return value;
		};
		for (const entry of this.objectsById.values()) {
			if (Array.isArray(entry)) {
				for (let i = 0; i < entry.length; i++) {
					entry[i] = deref(entry[i]!);
				}
			} else {
				for (const key of Object.keys(entry.members)) {
					entry.members[key] = deref(entry.members[key]!);
				}
			}
		}
	}

	private u8(): number {
		return this.bytes[this.pos++]!;
	}

	private i16(): number {
		const v = this.view.getInt16(this.pos, true);
		this.pos += 2;
		return v;
	}

	private u16(): number {
		const v = this.view.getUint16(this.pos, true);
		this.pos += 2;
		return v;
	}

	private i32(): number {
		const v = this.view.getInt32(this.pos, true);
		this.pos += 4;
		return v;
	}

	private i64(): bigint {
		const v = this.view.getBigInt64(this.pos, true);
		this.pos += 8;
		return v;
	}

	private u64(): bigint {
		const v = this.view.getBigUint64(this.pos, true);
		this.pos += 8;
		return v;
	}

	private readChar(): string {
		const first = this.bytes[this.pos]!;
		let size = 1;
		if (first >= 0xf0) {
			size = 4;
		} else if (first >= 0xe0) {
			size = 3;
		} else if (first >= 0xc0) {
			size = 2;
		}
		const str = new TextDecoder().decode(
			this.bytes.subarray(this.pos, this.pos + size),
		);
		this.pos += size;
		return str;
	}

	/** Read a length-prefixed UTF-8 string (7-bit encoded length). */
	private readString(): string {
		let length = 0;
		let shift = 0;
		while (true) {
			const b = this.u8();
			length |= (b & 0x7f) << shift;
			if ((b & 0x80) === 0) {
				break;
			}
			shift += 7;
		}
		const str = new TextDecoder().decode(
			this.bytes.subarray(this.pos, this.pos + length),
		);
		this.pos += length;
		return str;
	}
}
