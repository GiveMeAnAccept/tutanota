import {create} from "../../common/utils/EntityUtils.js"
import {TypeRef, downcast} from "@tutao/tutanota-utils"
import type {TypeModel} from "../../common/EntityTypes.js"


export const StatisticLogRefTypeRef: TypeRef<StatisticLogRef> = new TypeRef("tutanota", "StatisticLogRef")
export const _TypeModel: TypeModel = {
	"name": "StatisticLogRef",
	"since": 25,
	"type": "AGGREGATED_TYPE",
	"id": 875,
	"rootId": "CHR1dGFub3RhAANr",
	"versioned": false,
	"encrypted": false,
	"values": {
		"_id": {
			"id": 876,
			"type": "CustomId",
			"cardinality": "One",
			"final": true,
			"encrypted": false
		}
	},
	"associations": {
		"items": {
			"id": 877,
			"type": "LIST_ASSOCIATION",
			"cardinality": "One",
			"final": true,
			"refType": "StatisticLogEntry"
		}
	},
	"app": "tutanota",
	"version": "49"
}

export function createStatisticLogRef(values?: Partial<StatisticLogRef>): StatisticLogRef {
	return Object.assign(create(_TypeModel, StatisticLogRefTypeRef), downcast<StatisticLogRef>(values))
}

export type StatisticLogRef = {
	_type: TypeRef<StatisticLogRef>;

	_id: Id;

	items: Id;
}