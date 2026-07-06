import type { RigidBody } from "./rigid-body";

export const computeGrounded = (body: RigidBody): boolean => {
	for (const { normal } of body.touchingContacts()) {
		if (normal.y > 0.5) {
			return true;
		}
	}
	return false;
};
