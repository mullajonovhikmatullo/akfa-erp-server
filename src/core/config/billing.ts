const DEFAULT_TRIAL_DAYS = 14;

export function getTrialDays(): number {
    const configured = Number(process.env.TRIAL_DAYS ?? process.env.FREE_TRIAL_DAYS);
    if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
    return DEFAULT_TRIAL_DAYS;
}

export function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function addMonths(date: Date, months = 1): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}
