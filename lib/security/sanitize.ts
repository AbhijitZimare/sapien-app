// Strip HTML tags and dangerous characters from user input
export function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/[<>'"]/g, (char) => {
      const map: Record<string, string> = {
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
      };
      return map[char] || char;
    })
    .trim()
    .slice(0, 10000);
}

// Sanitize for display in dangerouslySetInnerHTML
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "");
}

// Rate limiting helper (client-side guard)
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: number[] = [];

  return function isAllowed(): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;

    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }

    if (requests.length >= maxRequests) {
      return false;
    }

    requests.push(now);
    return true;
  };
}
