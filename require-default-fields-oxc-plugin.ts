const rule = {
	meta: {
		type: "problem" as const,
		fixable: "code" as const,
		messages: {
			missingInitializer:
				"Field '{{name}}' in @{{decorator}} class must have a default initializer.",
		},
	},
	create(context: { report: Function }) {
		const DECORATORS = new Set(["serializable", "valueType"]);

		const getDecoratorNames = (node: any): string[] => {
			return (node.decorators ?? [])
				.map((d: any) => {
					if (d.expression.type === "CallExpression") {
						return d.expression.callee.name;
					}
					if (d.expression.type === "Identifier") {
						return d.expression.name;
					}
					return null;
				})
				.filter(Boolean);
		};

		const getMatchingDecorator = (node: any): string | undefined => {
			return getDecoratorNames(node).find((name) =>
				DECORATORS.has(name),
			);
		};

		const paramDefaults = (node: any): Set<string> => {
			const ctor = node.body.body.find(
				(m: any) =>
					m.type === "MethodDefinition" && m.kind === "constructor",
			);
			if (!ctor) {
				return new Set();
			}
			return new Set(
				ctor.value.params
					.filter(
						(p: any) =>
							(p.type === "TSParameterProperty" &&
								p.parameter.type === "AssignmentPattern") ||
							p.type === "AssignmentPattern",
					)
					.map((p: any) => {
						const inner =
							p.type === "TSParameterProperty" ? p.parameter : p;
						return inner.left?.name ?? inner.name;
					})
					.filter(Boolean),
			);
		};

		return {
			ClassDeclaration(node: any) {
				const decorator = getMatchingDecorator(node);
				if (!decorator) {
					return;
				}

				const defaults = paramDefaults(node);

				for (const member of node.body.body) {
					if (member.type !== "PropertyDefinition") {
						continue;
					}
					if (member.value !== null) {
						continue;
					}
					const fieldName = member.key.name;
					if (defaults.has(fieldName)) {
						continue;
					}

					context.report({
						node: member,
						messageId: "missingInitializer",
						data: { name: fieldName, decorator },
					});
				}
			},
		};
	},
};

const plugin = {
	meta: { name: "ecs-conventions" },
	rules: { "require-default-fields": rule },
};

export default plugin;
