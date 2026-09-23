import { fetchExt } from '../../utils/fetch-utils';

const DEFAULT_APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

export interface ApolloContact {
  email?: string | null;
  email_status?: string | null;
  id: string;
  typed_custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ApolloSearchResponse {
  contacts: ApolloContact[];
  pagination?: {
    page: number;
    per_page: number;
    total_pages?: number;
    total_entries?: number;
  };
}

export interface ApolloLabel {
  cached_count?: number;
  created_at?: string;
  id: string;
  name: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ApolloLabelsResponse {
  labels: ApolloLabel[];
  pagination?: {
    page: number;
    per_page: number;
    total_pages?: number;
    total_entries?: number;
  };
}

export interface ApolloOutreachEmailRecipient {
  contact_id?: string | null;
  email?: string | null;
  raw_name?: string | null;
  recipient_type_cd?: string | null;
  user_id?: string | null;
}

export interface ApolloOutreachEmailMessage {
  campaign_name?: string | null;
  completed_at?: string | null;
  contact_id?: string | null;
  due_at?: string | null;
  emailer_campaign_id?: string | null;
  emailer_step_id?: string | null;
  id: string;
  not_sent_reason?: string | null;
  recipients?: ApolloOutreachEmailRecipient[];
  status?: string | null;
  to_email?: string | null;
  to_name?: string | null;
  [key: string]: unknown;
}

export interface ApolloOutreachEmailSearchResponse {
  emailer_messages: ApolloOutreachEmailMessage[];
  pagination?: {
    page: number;
    per_page: number;
    total_pages?: number;
    total_entries?: number;
  };
}

export interface ApolloSequenceSearchResponse {
  breadcrumbs?: Record<string, unknown>[];
  emailer_campaigns: Array<{
    id: string;
    name?: string;
    archived?: boolean;
    created_at?: string;
    active?: boolean;
    [key: string]: unknown;
  }>;
  pagination?: {
    page: number;
    per_page: number;
    total_pages?: number;
    total_entries?: number;
  };
}

export interface ApolloClientOptions {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Apollo REST API client with helpers for contacts, lists, and sequences.
 *
 * @example
 * const apollo = new ApolloClient({ apiKey: process.env.APOLLO_API_KEY! });
 * const labels = await apollo.getAllLabels();
 */
export class ApolloClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: ApolloClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_APOLLO_BASE_URL;
  }

  /**
   * Get all labels (lists) with pagination.
   */
  async getLabels(page = 1, perPage = 100): Promise<ApolloLabelsResponse> {
    const response = await this.request<ApolloLabel[] | ApolloLabelsResponse>(
      'GET',
      `/labels?page=${page}&per_page=${perPage}`
    );

    if (Array.isArray(response)) {
      return { labels: response };
    }

    if (response.labels && Array.isArray(response.labels)) {
      return response;
    }

    return { labels: [] };
  }

  /**
   * Get all labels across all pages (best-effort).
   */
  async getAllLabels(): Promise<ApolloLabel[]> {
    const resp = await this.getLabels(1, 500);
    return resp.labels;
  }

  /**
   * Search contacts by label/list ID.
   */
  async searchContactsByLabelId(params: {
    labelId: string;
    page: number;
    perPage: number;
  }): Promise<ApolloSearchResponse> {
    return await this.request<ApolloSearchResponse>(
      'POST',
      '/contacts/search',
      {
        contact_label_ids: [params.labelId],
        page: params.page,
        per_page: params.perPage,
        sort_by_field: 'contact_created_at',
      }
    );
  }

  /**
   * Bulk update contacts' custom fields.
   */
  async bulkUpdateContactsCustomFields(
    updates: {
      id: string;
      typed_custom_fields: Record<string, string | undefined>;
    }[]
  ): Promise<void> {
    if (updates.length === 0) return;

    await this.request('POST', '/contacts/bulk_update', {
      async: true,
      contact_attributes: updates,
    });
  }

  /**
   * Search outreach emails (sequence emails).
   */
  async searchOutreachEmails(params: {
    emailerCampaignIds?: string[];
    emailerMessageStats?: string[];
    emailerMessageDateRangeMode?: 'due_at' | 'completed_at';
    emailerMessageDateRangeMin?: string;
    emailerMessageDateRangeMax?: string;
    page: number;
    perPage: number;
  }): Promise<ApolloOutreachEmailSearchResponse> {
    const query = this.buildQuery({
      'emailer_campaign_ids[]': params.emailerCampaignIds,
      emailer_message_date_range_mode: params.emailerMessageDateRangeMode,
      'emailer_message_date_range[max]': params.emailerMessageDateRangeMax,
      'emailer_message_date_range[min]': params.emailerMessageDateRangeMin,
      'emailer_message_stats[]': params.emailerMessageStats,
      page: params.page,
      per_page: params.perPage,
    });

    return await this.request<ApolloOutreachEmailSearchResponse>(
      'GET',
      `/emailer_messages/search${query}`
    );
  }

  /**
   * Update contact status in sequences (remove/stop/mark_as_finished).
   */
  async updateSequenceContactStatus(params: {
    emailerCampaignIds: string[];
    contactIds: string[];
    mode: 'mark_as_finished' | 'remove' | 'stop';
  }): Promise<void> {
    const query = this.buildQuery({
      'contact_ids[]': params.contactIds,
      'emailer_campaign_ids[]': params.emailerCampaignIds,
      mode: params.mode,
    });

    await this.request(
      'POST',
      `/emailer_campaigns/remove_or_stop_contact_ids${query}`
    );
  }

  /**
   * Search sequences by name.
   */
  async searchSequences(params: {
    query?: string;
    page?: number;
    perPage?: number;
  }): Promise<ApolloSequenceSearchResponse> {
    const query = this.buildQuery({
      page: params.page,
      per_page: params.perPage,
      q_name: params.query,
    });

    return await this.request<ApolloSequenceSearchResponse>(
      'POST',
      `/emailer_campaigns/search${query}`
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetchExt({
      init: {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        method,
      },
      retries: 3,
      retryDelay: 750,
      url,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Apollo API error: ${response.status} ${response.statusText} - ${text}`
      );
    }

    return (await response.json()) as T;
  }

  private buildQuery(params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined || item === null) continue;
          searchParams.append(key, String(item));
        }
        continue;
      }
      searchParams.append(key, String(value));
    }
    const query = searchParams.toString();
    return query.length > 0 ? `?${query}` : '';
  }
}

/**
 * Apollo email_status values that are treated as verified.
 */
export const APOLLO_VERIFIED_STATUSES = new Set(['verified']);

/**
 * Check if a contact's email is verified by Apollo.
 */
export function isApolloVerified(contact: ApolloContact): boolean {
  const status = contact.email_status?.toLowerCase() ?? '';
  return APOLLO_VERIFIED_STATUSES.has(status);
}

/**
 * Extract a contact's email if it is a non-empty string.
 */
export function getContactEmail(contact: ApolloContact): string | null {
  return typeof contact.email === 'string' && contact.email.length > 0
    ? contact.email
    : null;
}
