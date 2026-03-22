/**
 * Svelte action that teleports an element to document.body.
 * Useful for modals/dialogs rendered inside elements with `transform`,
 * which creates a new containing block and breaks `position: fixed`.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);

	return {
		destroy() {
			node.remove();
		}
	};
}
