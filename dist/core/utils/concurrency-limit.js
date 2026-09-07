"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConcurrencyLimit = createConcurrencyLimit;
// No waiting queue: queued uploads would retain their request buffers.
function createConcurrencyLimit(maximum) {
    let active = 0;
    return {
        tryAcquire() {
            if (active >= maximum)
                return null;
            active += 1;
            let released = false;
            return () => {
                if (released)
                    return;
                released = true;
                active -= 1;
            };
        },
    };
}
