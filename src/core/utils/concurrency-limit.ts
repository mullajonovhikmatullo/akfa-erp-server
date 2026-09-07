// No waiting queue: queued uploads would retain their request buffers.
export function createConcurrencyLimit(maximum: number) {
    let active = 0;
    return {
        tryAcquire(): (() => void) | null {
            if (active >= maximum) return null;
            active += 1;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                active -= 1;
            };
        },
    };
}
