import type { SpriteComponent } from "../../engine/sprite/sprite-component";
import type { History } from "../history";
import { Field } from "../inspector/field";
import { ImagePreview, useImageDrop } from "../inspector/image-input";
import { Checkbox, NumberInput } from "../inspector/inputs";
import { commit } from "../inspector/inspector";
import { Preview } from "../inspector/preview";

const SpriteField = ({
	value,
	history,
}: Readonly<{ value: SpriteComponent; history: History }>) => {
	const { dragging, rootProps } = useImageDrop({
		component: value,
		fieldKey: "urlRef",
		onCommit: (s) => commit(history, value.urlRef, "path", s),
	});
	return (
		<Preview.Root>
			<Preview.Body>
				<ImagePreview
					value={value.urlRef.path}
					dragging={dragging}
					rootProps={rootProps}
				/>
				<Preview.Inputs>
					<Field.Root>
						<Field.Label>Opacity</Field.Label>
						<NumberInput
							value={value.opacity.value}
							onCommit={(n) =>
								commit(history, value.opacity, "value", n)
							}
						/>
					</Field.Root>
					<Field.Root>
						<Checkbox
							checked={value.flipX}
							onCheckedChange={(c) =>
								commit(history, value, "flipX", c)
							}
						/>
						<Field.Label>Flip X</Field.Label>
					</Field.Root>
				</Preview.Inputs>
			</Preview.Body>
		</Preview.Root>
	);
};

export default SpriteField;
