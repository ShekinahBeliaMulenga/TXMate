/** How an offering's price is shown. A free offering stores a rate of 0 and the FREE rate type. */

const BASIS: Record<string, string> = {
  PER_SESSION: "per session",
  PER_HOUR: "per hour",
  PER_WEEK: "per week",
  PER_MONTH: "per month",
  PER_COURSE: "per course",
  CUSTOM: "custom pricing",
};

export function isFreeOffering(rateType: string | null | undefined, rate?: string | number | null) {
  return rateType === "FREE" || (rate !== undefined && rate !== null && String(rate).trim() !== "" && Number(rate) === 0);
}

/** "Free", or the amount with its currency, e.g. "ZMW 150". */
export function priceText(rate: string | number, currency: string, rateType?: string | null) {
  if (isFreeOffering(rateType, rate)) return "Free";
  const amount = Number(rate);
  if (!Number.isFinite(amount)) return `${currency} ${rate}`;
  return `${currency} ${amount.toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** The "per session" style label; empty for free offerings, which have no billing basis. */
export function priceBasisText(rateType: string | null | undefined, rate?: string | number | null) {
  if (isFreeOffering(rateType, rate)) return "";
  return rateType ? BASIS[rateType] ?? "" : "";
}
