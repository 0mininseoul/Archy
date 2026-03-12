// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  getSentryEnvironment,
  getServerSentryDsn,
  sanitizeSentryUrl,
} from "@/lib/monitoring/sentry-config";

const dsn = getServerSentryDsn();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: getSentryEnvironment(),
  sendDefaultPii: false,
  beforeSend(event) {
    const sanitizedUrl = sanitizeSentryUrl(event.request?.url);
    if (sanitizedUrl) {
      event.request = {
        ...event.request,
        url: sanitizedUrl,
      };
    }

    return event;
  },
});
