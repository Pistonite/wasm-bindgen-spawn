export const ThreadState = {
	Ready: 1,
	Success: 0,
	Panic: 2,
	Initialized: 3,
	Failed: 4,
} as const;

export type ThreadStateType =
	typeof ThreadState[keyof typeof ThreadState];
