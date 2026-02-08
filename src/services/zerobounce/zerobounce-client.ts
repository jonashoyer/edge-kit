import fs from "node:fs";
import path from "node:path";

import { fetchExt } from "../../utils/fetch-utils";
import { Throttler } from "../../utils/throttler";

export interface ZeroBounceEmailResult {
  address: string;
  status:
    | "valid"
    | "invalid"
    | "catch-all"
    | "spamtrap"
    | "abuse"
    | "do_not_mail"
    | "unknown";
  sub_status?:
    | "alias_address"
    | "antispam_system"
    | "does_not_accept_mail"
    | "exception_occurred"
    | "failed_smtp_connection"
    | "failed_syntax_check"
    | "forcible_disconnect"
    | "global_suppression"
    | "greylisted"
    | "leading_period_removed"
    | "mail_server_did_not_respond"
    | "mail_server_temporary_error"
    | "mailbox_quota_exceeded"
    | "mailbox_not_found"
    | "no_dns_entries"
    | "possible_trap"
    | "possible_typo"
    | "role_based"
    | "role_based_catch_all"
    | "timeout_exceeded"
    | "unroutable_ip_address"
    | "disposable"
    | "toxic"
    | "alternate"
    | "accept_all"
    | "role_based_accept_all";
  error?: string;
}

export interface ZeroBounceResponse {
  email_batch: ZeroBounceEmailResult[];
  errors?: Array<{ error: string; email_address: string }>;
}

export interface ZeroBounceClientOptions {
  /**
   * Maximum number of API calls per minute.
   * @default 5
   */
  requestsPerMinute?: number;
  /**
   * Optional cache file path for storing results across runs.
   */
  cacheFilePath?: string;
  /**
   * Enable on-disk caching for validated emails.
   * @default false
   */
  enableCache?: boolean;
}

/**
 * ZeroBounce client for batch email validation with optional caching and throttling.
 *
 * @example
 * const zb = new ZeroBounceClient(process.env.ZEROBOUNCE_API_KEY!, {
 *   requestsPerMinute: 5,
 *   enableCache: true,
 *   cacheFilePath: "./zerobounce-cache.json",
 * });
 * const res = await zb.validateEmailsBatch(["a@b.com", "c@d.com"]);
 */
export class ZeroBounceClient {
  private readonly apiKey: string;
  private readonly throttler: Throttler;
  private readonly batchSize = 200;
  private readonly cacheFilePath?: string;
  private readonly cache: Map<string, ZeroBounceEmailResult>;
  private readonly enableCache: boolean;

  constructor(apiKey: string, options?: ZeroBounceClientOptions) {
    this.apiKey = apiKey;
    const requestsPerMinute = options?.requestsPerMinute ?? 5;
    this.throttler = new Throttler(requestsPerMinute);
    this.enableCache =
      options?.enableCache ?? Boolean(options?.cacheFilePath);
    this.cacheFilePath =
      options?.cacheFilePath ??
      (this.enableCache
        ? path.join(process.cwd(), "zerobounce-cache.json")
        : undefined);
    this.cache = this.enableCache ? this.loadCache() : new Map();
  }

  /**
   * Validate a batch of emails (max 200 per request).
   */
  async validateEmailsBatch(emails: string[]): Promise<ZeroBounceResponse> {
    if (emails.length > this.batchSize) {
      throw new Error(
        `Batch size cannot exceed ${this.batchSize} emails. Received ${emails.length}`
      );
    }

    const cachedResults: ZeroBounceEmailResult[] = [];
    const uncachedEmails: string[] = [];

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase();
      const cachedResult = this.cache.get(normalizedEmail);
      if (cachedResult) {
        cachedResults.push(cachedResult);
      } else {
        uncachedEmails.push(email);
      }
    }

    if (uncachedEmails.length === 0) {
      return {
        email_batch: cachedResults,
      };
    }

    await this.throttler.waitForSlot();

    const url = new URL("https://api.zerobounce.net/v2/validatebatch");

    const response = await fetchExt({
      url: url.toString(),
      init: {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          api_key: this.apiKey,
          email_batch: uncachedEmails.map((email) => ({
            email_address: email,
            ip_address: null,
          })),
          activity_data: true,
          verify_plus: true,
        }),
      },
      retries: 3,
      retryDelay: 750,
      timeout: 120_000,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ZeroBounce validation failed: ${response.status} ${response.statusText} - ${text}`
      );
    }

    const apiResponse = (await response.json()) as ZeroBounceResponse;

    if (this.enableCache) {
      for (const result of apiResponse.email_batch) {
        this.cache.set(result.address.toLowerCase(), result);
      }
      this.saveCache();
    }

    return {
      email_batch: [...cachedResults, ...apiResponse.email_batch],
      errors: apiResponse.errors,
    };
  }

  private loadCache(): Map<string, ZeroBounceEmailResult> {
    if (!this.cacheFilePath) return new Map();
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const data = fs.readFileSync(this.cacheFilePath, "utf8");
        const parsed = JSON.parse(data) as Record<
          string,
          ZeroBounceEmailResult
        >;
        return new Map(Object.entries(parsed));
      }
    } catch {
      return new Map();
    }
    return new Map();
  }

  private saveCache(): void {
    if (!this.cacheFilePath) return;
    try {
      const cacheObject = Object.fromEntries(this.cache.entries());
      fs.writeFileSync(
        this.cacheFilePath,
        JSON.stringify(cacheObject, null, 2),
        "utf8"
      );
    } catch {
      return;
    }
  }
}
