export const examples = [
	"example_join_handle",
	"example_mpsc_channel",
	"example_atomic_usize",
	"example_atomic_usize_pooled",
	"example_sleep",
	"example_mutex",
	"example_mutex_poison",
] as const;

export type Example = typeof examples[number];

export function invokeWorkerMethod(worker: Worker, method: Example) {
	worker.postMessage(method);
}
