import posthog from "posthog-js";

// PostHog is only initialised when NEXT_PUBLIC_POSTHOG_KEY is set, so skip
// tracking calls otherwise instead of logging errors.
export const track = (event: string, properties?: Record<string, unknown>) => {
    if (posthog.__loaded) posthog.capture(event, properties);
};
