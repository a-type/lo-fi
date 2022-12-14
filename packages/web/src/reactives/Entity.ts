import {
	assignOid,
	cloneDeep,
	createRef,
	decomposeOid,
	EventSubscriber,
	isObjectRef,
	maybeGetOid,
	ObjectIdentifier,
	Operation,
	PatchCreator,
	StorageFieldSchema,
	StorageFieldsSchema,
	traverseCollectionFieldsAndApplyDefaults,
} from '@lo-fi/common';
import { WeakRef } from './FakeWeakRef.js';

export const ADD_OPERATIONS = '@@addOperations';
export const DELETE = '@@delete';
export const REBASE = '@@rebase';
const REFRESH = '@@refresh';
const DEEP_CHANGE = '@@deepChange';

export interface CacheTools {
	computeView(oid: ObjectIdentifier): { view: any; deleted: boolean };
	getEntity(
		oid: ObjectIdentifier,
		schema: StorageFieldSchema,
		parent?: Entity,
	): Entity;
	hasOid(oid: ObjectIdentifier): boolean;
}

export interface StoreTools {
	addLocalOperations(operations: Operation[]): void;
	patchCreator: PatchCreator;
}

export type AccessibleEntityProperty<T> = T extends Array<any>
	? number
	: T extends object
	? keyof T
	: never;

type DataFromInit<Init> = Init extends { [key: string]: any }
	? {
			[Key in keyof Init]-?: Init[Key];
	  }
	: Init extends Array<any>
	? Init
	: any;

export type EntityShape<E extends Entity<any, any>> = E extends Entity<
	infer Value,
	any
>
	? Value
	: never;

export function refreshEntity(
	entity: Entity<any, any>,
	info: EntityChangeInfo,
) {
	return entity[REFRESH](info);
}

export interface EntityChangeInfo {
	isLocal?: boolean;
}

type EntityEvents = {
	change: (info: EntityChangeInfo) => void;
	changeDeep: (target: Entity<any, any>, info: EntityChangeInfo) => void;
	delete: (info: EntityChangeInfo) => void;
	restore: (info: EntityChangeInfo) => void;
};

type BaseEntityValue = { [Key: string]: any } | any[];

export class Entity<
	Init = any,
	KeyValue extends BaseEntityValue = any,
	Snapshot extends any = DataFromInit<Init>,
> implements
		ObjectEntity<Init, KeyValue, Snapshot>,
		ListEntity<Init, KeyValue, Snapshot>
{
	// if current is null, the entity was deleted.
	protected _current: any | null = null;

	readonly oid: ObjectIdentifier;
	protected readonly store: StoreTools;
	protected readonly fieldSchema;
	protected readonly keyPath;
	protected readonly cache: CacheTools;
	protected _deleted = false;
	protected parent: WeakRef<Entity<any, any>> | undefined;

	private cachedSnapshot: any = null;
	private cachedDestructure: KeyValue | null = null;

	protected events = new EventSubscriber<EntityEvents>();

	protected hasSubscribersToDeepChanges() {
		return this.events.subscriberCount('changeDeep') > 0;
	}

	get hasSubscribers() {
		if (this.events.totalSubscriberCount() > 0) {
			return true;
		}

		// even if nobody subscribes directly to this entity, if a parent
		// has a deep subscription that counts.
		let parent = this.parent?.deref();
		while (parent) {
			if (parent.hasSubscribersToDeepChanges()) {
				return true;
			}
			parent = parent.parent?.deref();
		}

		return false;
	}

	get deleted() {
		return this._deleted;
	}

	protected get value() {
		return this._current;
	}

	get isList() {
		return Array.isArray(this._current) as any;
	}

	constructor({
		oid,
		store,
		fieldSchema,
		cache,
		parent,
	}: {
		oid: ObjectIdentifier;
		store: StoreTools;
		fieldSchema: StorageFieldSchema | StorageFieldsSchema;
		cache: CacheTools;
		parent?: Entity<any, any>;
	}) {
		this.oid = oid;
		this.parent = parent && new WeakRef(parent);
		this.store = store;
		this.fieldSchema = fieldSchema;
		this.keyPath = decomposeOid(oid).keyPath;
		this.cache = cache;
		const { view, deleted } = this.cache.computeView(oid);
		this._current = view;
		this._deleted = deleted;

		if (this.oid.includes('.') && !this.parent) {
			throw new Error('Parent must be provided for sub entities');
		}
	}

	private [REFRESH] = (info: EntityChangeInfo) => {
		const { view, deleted } = this.cache.computeView(this.oid);
		this._current = view;
		const restored = this._deleted && !deleted;
		this._deleted = deleted;
		this.cachedDestructure = null;

		if (this._deleted) {
			this.events.emit('delete', info);
		} else {
			this.events.emit('change', info);
			this[DEEP_CHANGE](this as unknown as Entity<any, any>, info);
		}
		if (restored) {
			this.cachedSnapshot = null;
			this.events.emit('restore', info);
		}
	};

	private [DEEP_CHANGE] = (
		source: Entity<any, any>,
		info: EntityChangeInfo,
	) => {
		this.cachedSnapshot = null;
		this.events.emit('changeDeep', source, info);
		const parent = this.parent?.deref();
		if (parent) {
			parent[DEEP_CHANGE](source, info);
		}
	};

	protected getChildFieldSchema = (key: any) => {
		if (this.fieldSchema.type === 'object') {
			return this.fieldSchema.properties[key];
		} else if (this.fieldSchema.type === 'array') {
			return this.fieldSchema.items;
		} else if (this.fieldSchema.type === 'map') {
			return this.fieldSchema.values;
		} else if (this.fieldSchema.type === 'any') {
			return this.fieldSchema;
		}
		throw new Error('Invalid field schema');
	};

	dispose = () => {
		this.events.dispose();
	};

	subscribe = <EventName extends keyof EntityEvents>(
		event: EventName,
		callback: EntityEvents[EventName],
	) => {
		const unsubscribe = this.events.subscribe(event, callback);

		return unsubscribe;
	};

	protected addPatches = (patches: Operation[]) => {
		this.store.addLocalOperations(patches);
	};

	protected cloneCurrent = () => {
		if (this._current === undefined) {
			return undefined;
		}
		return cloneDeep(this._current);
	};

	protected getSubObject = (
		oid: ObjectIdentifier,
		key: any,
	): Entity<any, any> => {
		const fieldSchema = this.getChildFieldSchema(key);
		return this.cache.getEntity(oid, fieldSchema, this);
	};

	protected wrapValue = <Key extends keyof KeyValue>(
		value: any,
		key: Key,
	): KeyValue[Key] => {
		if (isObjectRef(value)) {
			const oid = value.id;
			const subObject = this.getSubObject(oid, key);
			if (subObject) {
				return subObject as any;
			}
			throw new Error(
				`CACHE MISS: Subobject ${oid} does not exist on ${this.oid}`,
			);
		}
		return value;
	};

	get = <Key extends keyof KeyValue>(key: Key): KeyValue[Key] => {
		if (this.value === undefined || this.value === null) {
			throw new Error('Cannot access deleted entity');
		}

		const value = this.value[key];
		return this.wrapValue(value, key);
	};

	getAll = (): KeyValue => {
		if (this.value === undefined || this.value === null) {
			throw new Error('Cannot access deleted entity');
		}

		if (this.cachedDestructure) return this.cachedDestructure;

		let result: any;
		if (Array.isArray(this.value)) {
			result = this.value.map((value, index) =>
				this.wrapValue(value, index as any),
			) as any;
		} else {
			result = {} as any;
			for (const key in this.value) {
				result[key as any] = this.get(key as any);
			}
		}
		this.cachedDestructure = result;
		return result;
	};

	/**
	 * Returns a copy of the entity and all sub-objects as
	 * a plain object or array.
	 */
	getSnapshot = (): any => {
		if (!this.value) {
			return null;
		}
		if (this.deleted) {
			return null;
		}
		if (this.cachedSnapshot) {
			return this.cachedSnapshot;
		}
		let snapshot;
		if (Array.isArray(this.value)) {
			snapshot = this.value.map((item, idx) => {
				if (isObjectRef(item)) {
					return this.getSubObject(item.id, idx)?.getSnapshot();
				}
				return item;
			}) as Snapshot;
		} else {
			snapshot = { ...this.value };
			for (const [key, value] of Object.entries(snapshot)) {
				if (isObjectRef(value)) {
					snapshot[key] = this.getSubObject(value.id, key)?.getSnapshot();
				}
			}
		}

		assignOid(snapshot, this.oid);
		this.cachedSnapshot = snapshot;
		return snapshot;
	};

	/**
	 * Object methods
	 */
	keys = () => {
		return Object.keys(this.value || {});
	};
	entries = () => {
		return Object.entries(this.getAll());
	};
	set = <Key extends keyof Init>(key: Key, value: Init[Key]) => {
		const fieldSchema = this.getChildFieldSchema(key);
		if (fieldSchema) {
			traverseCollectionFieldsAndApplyDefaults(value, fieldSchema);
		}
		this.addPatches(
			this.store.patchCreator.createSet(
				this.oid,
				key as string | number,
				value,
				this.keyPath,
			),
		);
	};
	delete = (key: any) => {
		if (Array.isArray(this.value)) {
			this.addPatches(
				this.store.patchCreator.createListDelete(this.oid, key as number, 1),
			);
		} else {
			this.addPatches(this.store.patchCreator.createRemove(this.oid, key));
		}
	};
	/** @deprecated - renamed to delete */
	remove = this.delete.bind(this);

	update = (
		value: Partial<Snapshot>,
		{
			replaceSubObjects = false,
			merge = true,
		}: { replaceSubObjects?: boolean; merge?: boolean } = {
			/**
			 * If true, merged sub-objects will be replaced entirely if there's
			 * ambiguity about their identity.
			 */
			replaceSubObjects: false,
			/**
			 * If false, omitted keys will erase their respective fields.
			 */
			merge: true,
		},
	) => {
		if (
			!merge &&
			this.fieldSchema.type !== 'any' &&
			this.fieldSchema.type !== 'map'
		) {
			throw new Error(
				'Cannot use .update without merge if the field has a strict schema type. merge: false is only available on "any" or "map" types.',
			);
		}
		for (const [key, field] of Object.entries(value)) {
			const fieldSchema = this.getChildFieldSchema(key);
			if (fieldSchema) {
				traverseCollectionFieldsAndApplyDefaults(field, fieldSchema);
			}
		}
		this.addPatches(
			this.store.patchCreator.createDiff(
				this.getSnapshot(),
				assignOid(value, this.oid),
				this.keyPath,
				{
					mergeUnknownObjects: !replaceSubObjects,
					defaultUndefined: merge,
				},
			),
		);
	};

	/**
	 * List methods
	 */

	/**
	 * Returns the referent value of an item in the list, used for
	 * operations which act on items. if the item is an object,
	 * it will attempt to create an OID reference to it. If it
	 * is a primitive, it will return the primitive.
	 */
	private getItemRefValue = (item: ListItemValue<KeyValue>) => {
		if (typeof item === 'object') {
			const itemOid = maybeGetOid(item);
			if (!itemOid || !this.cache.hasOid(itemOid)) {
				throw new Error(
					`Cannot move object ${JSON.stringify(
						item,
					)} which does not exist in this list`,
				);
			}
			return itemOid;
		} else {
			return item;
		}
	};

	get length() {
		return this.value.length;
	}

	push = (value: ListItemInit<Init>) => {
		const fieldSchema = this.getChildFieldSchema(this.value.length);
		if (fieldSchema) {
			traverseCollectionFieldsAndApplyDefaults(value, fieldSchema);
		}
		this.addPatches(this.store.patchCreator.createListPush(this.oid, value));
	};
	insert = (index: number, value: ListItemInit<Init>) => {
		const fieldSchema = this.getChildFieldSchema(index);
		if (fieldSchema) {
			traverseCollectionFieldsAndApplyDefaults(value, fieldSchema);
		}
		this.addPatches(
			this.store.patchCreator.createListInsert(this.oid, index, value),
		);
	};
	move = (from: number, to: number) => {
		this.addPatches(
			this.store.patchCreator.createListMoveByIndex(this.oid, from, to),
		);
	};
	moveItem = (item: ListItemValue<KeyValue>, to: number) => {
		const itemRef = this.getItemRefValue(item);
		if (isObjectRef(itemRef)) {
			this.addPatches(
				this.store.patchCreator.createListMoveByRef(this.oid, itemRef, to),
			);
		} else {
			const index = this.value.indexOf(itemRef);
			this.addPatches(
				this.store.patchCreator.createListMoveByIndex(this.oid, index, to),
			);
		}
	};
	removeAll = (item: ListItemValue<KeyValue>) => {
		this.addPatches(
			this.store.patchCreator.createListRemove(
				this.oid,
				this.getItemRefValue(item),
			),
		);
	};
	removeFirst = (item: ListItemValue<KeyValue>) => {
		this.addPatches(
			this.store.patchCreator.createListRemove(
				this.oid,
				this.getItemRefValue(item),
				'first',
			),
		);
	};
	removeLast = (item: ListItemValue<KeyValue>) => {
		this.addPatches(
			this.store.patchCreator.createListRemove(
				this.oid,
				this.getItemRefValue(item),
				'last',
			),
		);
	};
	add = (item: ListItemValue<KeyValue>) => {
		this.addPatches(this.store.patchCreator.createListAdd(this.oid, item));
	};
	has = (item: ListItemValue<KeyValue>) => {
		if (typeof item === 'object') {
			return this.value.some((val: unknown) => {
				if (isObjectRef(val)) return val.id === maybeGetOid(item);
				return false;
			});
		}
		return this.value.includes(item);
	};

	// list implements an iterator which maps items to wrapped
	// versions
	[Symbol.iterator]() {
		let index = 0;
		return {
			next: () => {
				if (index < this.value.length) {
					return {
						value: this.get(index++) as ListItemValue<KeyValue>,
						done: false,
					} as const;
				}
				return {
					value: undefined,
					done: true,
				} as const;
			},
		};
	}

	// additional access methods

	private getAsWrapped = (): ListItemValue<KeyValue>[] => {
		return this.value.map(this.wrapValue);
	};

	map = <U>(callback: (value: ListItemValue<KeyValue>, index: number) => U) => {
		return this.getAsWrapped().map(callback);
	};

	filter = (
		callback: (value: ListItemValue<KeyValue>, index: number) => boolean,
	) => {
		return this.getAsWrapped().filter((val, index) => {
			return callback(val, index);
		});
	};
}

export interface BaseEntity<
	Init,
	Value extends BaseEntityValue,
	Snapshot = DataFromInit<Init>,
> {
	dispose: () => void;
	subscribe<EventName extends keyof EntityEvents>(
		event: EventName,
		callback: EntityEvents[EventName],
	): () => void;
	get<Key extends keyof Value>(key: Key): Value[Key];
	getAll(): Value;
	getSnapshot(): Snapshot;
	readonly deleted: boolean;
	readonly hasSubscribers: boolean;
}

export interface ObjectEntity<
	Init,
	Value extends BaseEntityValue,
	Snapshot = DataFromInit<Init>,
> extends BaseEntity<Init, Value, Snapshot> {
	keys(): string[];
	entries(): [string, Value[keyof Value]][];
	set<Key extends keyof Init>(key: Key, value: Init[Key]): void;
	delete(key: keyof Value): void;
	update(
		value: Partial<Snapshot>,
		options?: { replaceSubObjects?: boolean; merge?: boolean },
	): void;
	readonly isList: false;
}

export interface ListEntity<
	Init,
	Value extends BaseEntityValue,
	Snapshot = DataFromInit<Init>,
> extends Iterable<ListItemValue<Value>>,
		BaseEntity<Init, Value, Snapshot> {
	readonly isList: true;
	readonly length: number;
	push(value: ListItemInit<Init>): void;
	insert(index: number, value: ListItemInit<Init>): void;
	move(from: number, to: number): void;
	moveItem(item: ListItemValue<Value>, to: number): void;
	/**
	 * A Set operation which adds a value if an equivalent value is not already present.
	 * Object values are never the same.
	 */
	add(value: ListItemValue<Value>): void;
	removeAll(item: ListItemValue<Value>): void;
	removeFirst(item: ListItemValue<Value>): void;
	removeLast(item: ListItemValue<Value>): void;
	map<U>(callback: (value: ListItemValue<Value>, index: number) => U): U[];
	filter(
		callback: (value: ListItemValue<Value>, index: number) => boolean,
	): ListItemValue<Value>[];
	delete(index: number): void;
	has(value: ListItemValue<Value>): boolean;
}

export type AnyEntity<
	Init,
	KeyValue extends BaseEntityValue,
	Snapshot extends any,
> =
	| ListEntity<Init, KeyValue, Snapshot>
	| ObjectEntity<Init, KeyValue, Snapshot>;

type ListItemValue<KeyValue> = KeyValue extends Array<infer T> ? T : never;
type ListItemInit<Init> = Init extends Array<infer T> ? T : never;

export type EntityDestructured<T extends AnyEntity<any, any, any> | null> =
	| (T extends ListEntity<any, infer KeyValue, any>
			? KeyValue
			: T extends ObjectEntity<any, infer KeyValue, any>
			? KeyValue
			: never)
	| (T extends null ? null : never);
