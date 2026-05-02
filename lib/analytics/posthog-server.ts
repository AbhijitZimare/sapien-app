const POSTHOG_KEY = 'phc_mA4NLAjqiMXLyFdS4zJEEefKoc7Go3xUqgg4jTeSxi8x'
const POSTHOG_HOST = 'https://app.posthog.com'

export async function trackEvent(
  userId: string,
  event: string,
  properties: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        distinct_id: userId,
        event,
        properties: {
          ...properties,
          source: 'sapien_backend',
          environment: process.env.NODE_ENV
        },
        timestamp: new Date().toISOString()
      })
    })
  } catch (err) {
    console.error('PostHog track error:', err)
  }
}

// TEMPORARY: test PostHog connection directly
export async function testPostHog(): Promise<void> {
  const result = await fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      distinct_id: 'test-user-sapien',
      event: 'test_event',
      properties: { test: true }
    })
  })
  console.log('POSTHOG TEST:', result.status, await result.text())
}