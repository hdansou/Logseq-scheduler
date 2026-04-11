/**
 * Lightweight natural-language → cron converter.
 *
 * Supported patterns (case-insensitive):
 *  - "every day at 8am" / "daily at 09:30"
 *  - "every Saturday at 11 AM" / "every mon at 7:15 pm"
 *  - "every weekday at 9am"
 *  - "every weekend at 10am"
 *  - "every month on the 1st at 9am" / "monthly on day 15 at 17:00"
 *  - "every quarter on the 1st at 9am"       (Jan/Apr/Jul/Oct)
 *  - "every 6 months on the 1st at 9am"      (Jan/Jul → semi-annual)
 *  - "every year on January 1st at 12:00" / "yearly on 3/15 at 9am"
 *
 * Returns a 5-field cron string or throws with a helpful message.
 */
export function parseNaturalLanguage(input: string): string {
  const text = input.trim().toLowerCase();
  if (!text) throw new Error("Empty schedule");

  const time = extractTime(text);
  const min = time?.minute ?? 0;
  const hr = time?.hour ?? 0;

  // Yearly
  const yearlyMonthDay = matchYearly(text);
  if (yearlyMonthDay) {
    return `${min} ${hr} ${yearlyMonthDay.day} ${yearlyMonthDay.month} *`;
  }

  // Every N months
  const everyN = text.match(/every\s+(\d+)\s+months?/);
  if (everyN) {
    const step = parseInt(everyN[1], 10);
    const dom = matchDayOfMonth(text) ?? 1;
    if (step === 6) return `${min} ${hr} ${dom} 1,7 *`;
    if (step === 3) return `${min} ${hr} ${dom} 1,4,7,10 *`;
    return `${min} ${hr} ${dom} */${step} *`;
  }

  // Quarterly
  if (/\bquarter(ly)?\b/.test(text)) {
    const dom = matchDayOfMonth(text) ?? 1;
    return `${min} ${hr} ${dom} 1,4,7,10 *`;
  }

  // Semi-annual / twice a year
  if (/\bsemi[- ]?annual(ly)?\b|\btwice a year\b/.test(text)) {
    const dom = matchDayOfMonth(text) ?? 1;
    return `${min} ${hr} ${dom} 1,7 *`;
  }

  // Monthly
  if (/\b(monthly|every month)\b/.test(text)) {
    const dom = matchDayOfMonth(text) ?? 1;
    return `${min} ${hr} ${dom} * *`;
  }

  // Weekday / weekend
  if (/\bevery weekday\b/.test(text)) return `${min} ${hr} * * 1-5`;
  if (/\bevery weekend\b/.test(text)) return `${min} ${hr} * * 0,6`;

  // Specific day of the week
  const dow = matchDayOfWeek(text);
  if (dow !== null) return `${min} ${hr} * * ${dow}`;

  // Daily
  if (/\b(daily|every day)\b/.test(text)) return `${min} ${hr} * * *`;

  throw new Error(
    `Could not parse schedule: "${input}". Try phrases like "every Saturday at 11 AM" or "every month on the 1st at 9am".`,
  );
}

function extractTime(text: string): { hour: number; minute: number } | null {
  // "at 11 am", "at 11:30 pm", "at 09:30", "at 9am"
  const re =
    /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(\d{1,2}):(\d{2})\b/;
  const m = text.match(re);
  if (!m) return null;

  let hour: number;
  let minute: number;

  if (m[1] !== undefined) {
    hour = parseInt(m[1], 10);
    minute = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3];
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else {
    hour = parseInt(m[4], 10);
    minute = parseInt(m[5], 10);
  }
  return { hour, minute };
}

const DAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function matchDayOfWeek(text: string): number | null {
  for (const [name, num] of Object.entries(DAYS)) {
    const re = new RegExp(`\\bevery\\s+${name}\\b|\\b${name}s\\b`);
    if (re.test(text)) return num;
  }
  return null;
}

function matchDayOfMonth(text: string): number | null {
  const m = text.match(/\b(?:on\s+(?:the\s+)?|day\s+)(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

function matchYearly(text: string): { month: number; day: number } | null {
  if (!/\b(yearly|annually|every year)\b/.test(text)) {
    // Also accept "every January 1st at 9am" even without the word "yearly"
    const m1 = text.match(
      /\bevery\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
    );
    if (m1) return { month: MONTHS[m1[1]], day: parseInt(m1[2], 10) };
    return null;
  }

  // "every year on January 1st" or "every year on 3/15" or "every year on the 1st of January"
  const m2 = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  if (m2) return { month: MONTHS[m2[1]], day: parseInt(m2[2], 10) };

  const m3 = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m3) return { month: parseInt(m3[1], 10), day: parseInt(m3[2], 10) };

  const m4 = text.match(
    /\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/,
  );
  if (m4) return { month: MONTHS[m4[2]], day: parseInt(m4[1], 10) };

  return null;
}
