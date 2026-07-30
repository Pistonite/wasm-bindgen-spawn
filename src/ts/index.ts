import {dispatcherBuilder} from "./createDispatcher";

declare const args: Parameters<typeof dispatcherBuilder>;

dispatcherBuilder(
	args[0],
	args[1],
	args[2],
	args[3],
	args[4],
	args[5],
	args[6],
);
