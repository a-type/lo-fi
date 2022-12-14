import {
	applyPatch,
	assignOid,
	cloneDeep,
	DocumentBaseline,
	EventSubscriber,
	ObjectIdentifier,
	Operation,
	StorageFieldSchema,
} from '@lo-fi/common';
import { Entity, refreshEntity, StoreTools } from './Entity.js';
import type { EntityStore } from './EntityStore.js';
import { WeakRef } from './FakeWeakRef.js';

export class DocumentFamilyCache extends EventSubscriber<
	Record<`change:${string}`, () => void> & {
		'change:*': (oid: ObjectIdentifier) => void;
	}
> {
	readonly oid: ObjectIdentifier;
	private operationsMap: Map<ObjectIdentifier, Operation[]>;
	private unconfirmedOperationsMap: Map<ObjectIdentifier, Operation[]>;
	private baselinesMap: Map<ObjectIdentifier, DocumentBaseline>;

	private entities: Map<ObjectIdentifier, WeakRef<Entity>> = new Map();

	private storeTools: StoreTools;

	constructor({ oid, store }: { oid: ObjectIdentifier; store: EntityStore }) {
		super();
		this.oid = oid;
		this.operationsMap = new Map();
		this.unconfirmedOperationsMap = new Map();
		this.baselinesMap = new Map();
		this.storeTools = {
			addLocalOperations: store.addLocalOperations,
			patchCreator: store.meta.patchCreator,
		};
	}

	insertUnconfirmedOperations = (operations: Operation[]) => {
		const oidSet = new Set<ObjectIdentifier>();
		for (const operation of operations) {
			const { oid } = operation;
			oidSet.add(oid);
			const existingOperations = this.unconfirmedOperationsMap.get(oid) || [];
			existingOperations.push(operation);
			this.unconfirmedOperationsMap.set(oid, existingOperations);
		}
		for (const oid of oidSet) {
			const entityRef = this.entities.get(oid);
			const entity = entityRef?.deref();
			if (entity) {
				refreshEntity(entity, { isLocal: true });
				this.emit(`change:${oid}`);
				this.emit('change:*', oid);
			}
		}
	};

	insertOperations = (
		operations: Operation[],
		info: { isLocal: boolean },
		refreshEntities = true,
	) => {
		const oidSet = new Set<ObjectIdentifier>();
		for (const operation of operations) {
			const { oid } = operation;
			oidSet.add(oid);
			const existingOperations = this.operationsMap.get(oid) || [];
			// insert in order of timestamp
			const index = existingOperations.findIndex(
				(op) => op.timestamp >= operation.timestamp,
			);
			// ensure the operation doesn't already exist in this position
			if (index !== -1) {
				if (existingOperations[index].timestamp === operation.timestamp) {
					continue;
				}
				existingOperations.splice(index, 0, operation);
			} else {
				existingOperations.push(operation);
			}
			this.operationsMap.set(oid, existingOperations);

			// FIXME: seems inefficient
			const unconfirmedOperations = this.unconfirmedOperationsMap.get(oid);
			if (unconfirmedOperations) {
				this.unconfirmedOperationsMap.set(
					oid,
					unconfirmedOperations.filter(
						(op) => op.timestamp !== operation.timestamp,
					),
				);
			}
		}
		if (refreshEntities) {
			for (const oid of oidSet) {
				const entityRef = this.entities.get(oid);
				const entity = entityRef?.deref();
				if (entity) {
					refreshEntity(entity, info);
					this.emit(`change:${oid}`);
					this.emit('change:*', oid);
				}
			}
		}
	};

	insertBaselines = (
		baselines: DocumentBaseline[],
		_: { isLocal: boolean },
	) => {
		for (const baseline of baselines) {
			const { oid } = baseline;
			this.baselinesMap.set(oid, baseline);
			// drop operations before the baseline
			const ops = this.operationsMap.get(oid) || [];
			while (ops[0]?.timestamp < baseline.timestamp) {
				ops.shift();
			}
		}
	};

	addConfirmedData = ({
		operations,
		baselines,
		reset,
		isLocal,
	}: {
		operations: Operation[];
		baselines: DocumentBaseline[];
		reset?: boolean;
		isLocal?: boolean;
	}) => {
		if (reset) {
			this.operationsMap.clear();
			this.baselinesMap.clear();
		}
		const info = { isLocal: isLocal || false };
		this.insertBaselines(baselines, info);
		// for reset scenario, don't immediately update entities;
		// we will update all of them in one go.
		this.insertOperations(operations, info, !reset);
		if (reset) {
			for (const entityRef of this.entities.values()) {
				const entity = entityRef.deref();
				if (entity) {
					refreshEntity(entity, info);
				}
			}
		}
	};

	private applyOperations = (
		view: any,
		deleted: boolean,
		operations: Operation[],
		after?: string,
	) => {
		for (const operation of operations) {
			if (after && operation.timestamp <= after) {
				continue;
			}
			if (operation.data.op === 'delete') {
				deleted = true;
			} else {
				view = applyPatch(view, operation.data);
				if (operation.data.op === 'initialize') {
					deleted = false;
				}
			}
		}
		return { view, deleted };
	};

	computeView = (oid: ObjectIdentifier) => {
		const confirmed = this.computeConfirmedView(oid);
		const unconfirmedOperations = this.unconfirmedOperationsMap.get(oid) || [];
		let { view, deleted } = this.applyOperations(
			confirmed.view,
			confirmed.deleted,
			unconfirmedOperations,
		);
		if (view) {
			assignOid(view, oid);
		}
		return { view, deleted };
	};

	computeConfirmedView = (oid: ObjectIdentifier) => {
		const baseline = this.baselinesMap.get(oid);
		const operations = this.operationsMap.get(oid) || [];
		let view = cloneDeep(baseline?.snapshot || undefined);
		view = this.applyOperations(view, !view, operations, baseline?.timestamp);
		if (view) {
			assignOid(view, oid);
		}
		return view;
	};

	getEntity = (
		oid: ObjectIdentifier,
		schema: StorageFieldSchema,
		parent?: Entity,
	): Entity => {
		let entityRef = this.entities.get(oid);
		let entity = entityRef?.deref();
		if (!entity) {
			entity = new Entity({
				oid,
				cache: this,
				fieldSchema: schema,
				store: this.storeTools,
				parent,
			});

			// immediately add to cache and queue a removal if nobody subscribed
			this.entities.set(oid, new WeakRef(entity));
		}

		return entity as any;
	};

	hasOid = (oid: ObjectIdentifier) => {
		return this.operationsMap.has(oid) || this.baselinesMap.has(oid);
	};

	dispose = () => {
		this.entities.forEach((entity) => entity.deref()?.dispose());
		this.entities.clear();
	};

	reset = (operations: Operation[], baselines: DocumentBaseline[]) => {
		const info = { isLocal: false };
		this.baselinesMap = new Map(
			baselines.map((baseline) => [baseline.oid, baseline]),
		);
		this.operationsMap = new Map();
		this.insertOperations(operations, info);
		for (const oid of this.entities.keys()) {
			const entityRef = this.entities.get(oid);
			const entity = entityRef?.deref();
			if (entity) {
				refreshEntity(entity, info);
				this.emit(`change:${oid}`);
				this.emit('change:*', oid);
			}
		}
	};
}
