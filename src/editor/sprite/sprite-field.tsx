import type { SpriteComponent } from "../../engine/sprite/sprite-component";
import type { FieldBinding } from "../commands";
import { Field } from "../inspector/field";
import { ImagePreview, useImageDrop } from "../inspector/image-input";
import { Checkbox, NumberInput } from "../inspector/inputs";
import { Preview } from "../inspector/preview";

const SpriteField = ({
	value,
	binding,
}: Readonly<{ value: SpriteComponent; binding: FieldBinding }>) => {
	const { dragging, rootProps } = useImageDrop({
		component: value,
		fieldKey: "urlRef",
		onCommit: (s) => binding.commit(["urlRef", "path"], s),
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
								binding.commit(["opacity", "value"], n)
							}
						/>
					</Field.Root>
					<Field.Root>
						<Checkbox
							checked={value.flipX}
							onCheckedChange={(c) => binding.commit(["flipX"], c)}
						/>
						<Field.Label>Flip X</Field.Label>
					</Field.Root>
				</Preview.Inputs>
			</Preview.Body>
		</Preview.Root>
	);
};

export default SpriteField;
