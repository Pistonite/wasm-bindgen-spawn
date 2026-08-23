import { create } from "zustand";

import type { PanicRuntime } from "./util.ts";
import {
    type HarnessMessage,
    type LogMessage,
    makeHarnessMessage,
    parseHarnessMessage,
} from "./message.ts";

export type Store = {
    /** which panic runtime the examples are built and run with */
    panicRuntime: PanicRuntime;
    setPanicRuntime: (panicRuntime: PanicRuntime) => void;

    /** how many examples are running right now */
    runningCount: number;
    startRunning: () => void;
    finishRunning: () => void;

    /** clear the console before each example run, so only one run's output is shown */
    autoClear: boolean;
    setAutoClear: (autoClear: boolean) => void;

    /** everything logged so far, oldest first */
    messages: LogMessage[];
    addMessage: (message: LogMessage) => void;
    clearMessages: () => void;
};

export const useStore = create<Store>()((set) => ({
    panicRuntime: "unwind",
    setPanicRuntime: (panicRuntime) => {
        set({ panicRuntime });
    },

    runningCount: 0,
    startRunning: () => {
        set((state) => ({ runningCount: state.runningCount + 1 }));
    },
    finishRunning: () => {
        set((state) => ({ runningCount: Math.max(0, state.runningCount - 1) }));
    },

    autoClear: true,
    setAutoClear: (autoClear) => {
        set({ autoClear });
    },

    messages: [],
    addMessage: (message) => {
        set((state) => ({ messages: insertSorted(state.messages, message) }));
    },
    clearMessages: () => {
        set({ messages: [] });
    },
}));

/**
 * Insert keeping the log ordered by when a message was logged, not when it arrived.
 */
const insertSorted = (messages: LogMessage[], message: LogMessage): LogMessage[] => {
    let i = messages.length;
    while (i > 0 && messages[i - 1].timestamp > message.timestamp) {
        i--;
    }
    if (i === messages.length) {
        return [...messages, message];
    }
    return [...messages.slice(0, i), message, ...messages.slice(i)];
};

export const initHarness = () => {
    const bc = new BroadcastChannel("wbgspawn-harness");
    bc.addEventListener("message", (e) => {
        let msg: HarnessMessage;
        try {
            msg = JSON.parse(e.data);
        } catch (e) {
            console.error(e);
            return;
        }
        const log = parseHarnessMessage(msg);
        if (!log) {
            return;
        }
        const { addMessage } = useStore.getState();
        addMessage(log);
    });
};

export const logHarnessMessage = (msg: string) => {
    const log = parseHarnessMessage(makeHarnessMessage(msg));
    if (log) {
        const { addMessage } = useStore.getState();
        addMessage(log);
    }
};
