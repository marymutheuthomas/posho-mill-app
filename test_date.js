const targetDate = "2026-05-12";
const selected = new Date(targetDate);
selected.setHours(0, 0, 0, 0);
const startUtc = new Date(selected.getTime() - (3 * 60 * 60 * 1000)).toISOString();

const end = new Date(selected);
end.setHours(23, 59, 59, 999);
const endUtc = new Date(end.getTime() - (3 * 60 * 60 * 1000)).toISOString();

console.log("startUtc:", startUtc);
console.log("endUtc:", endUtc);
