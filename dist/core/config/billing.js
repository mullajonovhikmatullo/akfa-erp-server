"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrialDays = getTrialDays;
exports.addDays = addDays;
exports.addMonths = addMonths;
const DEFAULT_TRIAL_DAYS = 1;
function getTrialDays() {
    const configured = Number(process.env.TRIAL_DAYS ?? process.env.FREE_TRIAL_DAYS);
    if (Number.isFinite(configured) && configured > 0)
        return Math.floor(configured);
    return DEFAULT_TRIAL_DAYS;
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
function addMonths(date, months = 1) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}
