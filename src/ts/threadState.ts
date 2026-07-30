export const ThreadState = {
	Ready: 1,
	Success: 0,
	Panic: 2,
} as const;

export type ThreadStateType =
	typeof ThreadState[keyof typeof ThreadState];
