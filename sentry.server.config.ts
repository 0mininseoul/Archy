// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
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
