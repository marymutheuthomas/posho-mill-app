const targetDate = "2026-05-12";
const [y, m, d] = targetDate.split('-');
// Parse directly as local time to avoid the UTC parse quirk of YYYY-MM-DD
const selected = new Date(Number(y), Number(m) - 1, Number(d));

selected.setHours(0, 0, 0, 0);
const startUtc = selected.toISOString();

const end = new Date(selected);
end.setHours(23, 59, 59, 999);
const endUtc = end.toISOString();

console.log("startUtc:", startUtc);
console.log("endUtc:", endUtc);
