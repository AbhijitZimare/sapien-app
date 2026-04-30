const CRISIS_KEYWORDS = [
  "suicide",
  "kill myself",
  "want to die",
  "end my life",
  "self harm",
  "hurt myself",
  "cutting myself",
  "nobody cares",
  "better off dead",
  "abuse",
  "someone is hurting me",
];

export interface SafetyCheckResult {
  safe: boolean;
  crisis: boolean;
  message?: string;
}

export function checkInputSafety(input: string): SafetyCheckResult {
  const lower = input.toLowerCase();

  const isCrisis = CRISIS_KEYWORDS.some((kw) => lower.includes(kw));

  if (isCrisis) {
    return {
      safe: false,
      crisis: true,
      message: "crisis_detected",
    };
  }

  return { safe: true, crisis: false };
}

export const CRISIS_RESPONSE = `I noticed something in your message that 
concerns me. If you're going through a difficult time, please know that 
support is available.

**iCall India:** 9152987821
**Vandrevala Foundation:** 1860-2662-345 (24/7)
**iCall:** icallhelpline.org

You can also talk to a trusted adult — a parent, teacher, or school counselor.

I'm here to help with your studies, but your wellbeing matters most. 
Are you okay?`;
