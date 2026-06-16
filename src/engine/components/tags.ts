import { serializable } from "../serialization/serializable";

@serializable("Tags")
export class TagsComponent {
	tags: string[];

	constructor(tags: string[] = []) {
		this.tags = tags;
	}

	has(tag: string): boolean {
		return this.tags.includes(tag);
	}
}
