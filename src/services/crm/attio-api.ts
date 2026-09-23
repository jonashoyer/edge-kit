import { fetchExt } from '../../utils/fetch-utils';

const DEFAULT_ATTIO_BASE_URL = 'https://api.attio.com/v2';
const ATTIO_REQUEST_TIMEOUT_MS = 20_000;
const ATTIO_RETRY_DELAY_MS = 750;
const ATTIO_IDEMPOTENT_RETRY_COUNT = 3;
const ATTIO_RETRY_HTTP_STATUSES = [429, 503] as const;

export type AttioObjectSlug = 'people' | 'companies' | 'deals' | (string & {});

export interface AttioObjectMeta {
  attributes: Array<{
    id: string;
    slug: string;
    type: string;
    label?: string;
    required?: boolean;
  }>;
  id: string;
  name: string;
  slug: string;
}

// Common response typings for Attio record APIs
export interface AttioActor {
  id: string | null;
  type: 'system' | 'workspace-member';
}

export interface AttioValueBase<TAttributeType extends string> {
  active_from: string;
  active_until: string | null;
  attribute_type: TAttributeType;
  created_by_actor: AttioActor;
}

export interface AttioTextValueEntry extends AttioValueBase<'text'> {
  value: string;
}

export interface AttioNumberValueEntry extends AttioValueBase<'number'> {
  value: number;
}

export interface AttioTimestampValueEntry extends AttioValueBase<'timestamp'> {
  value: string;
}

export interface AttioInteractionValueEntry
  extends AttioValueBase<'interaction'> {
  interacted_at: string;
  interaction_type: string;
  owner_actor: AttioActor;
}

export interface AttioRecordReferenceEntry
  extends AttioValueBase<'record-reference'> {
  target_object: string;
  target_record_id: string;
}

export interface AttioLocationValueEntry extends AttioValueBase<'location'> {
  country_code: string;
  latitude: string | null;
  line_1: string | null;
  line_2: string | null;
  line_3: string | null;
  line_4: string | null;
  locality: string | null;
  longitude: string | null;
  postcode: string | null;
  region: string | null;
}

export interface AttioActorReferenceEntry
  extends AttioValueBase<'actor-reference'> {
  referenced_actor_id: string;
  referenced_actor_type: 'workspace-member' | string;
}

export interface AttioEmailAddressEntry
  extends AttioValueBase<'email-address'> {
  email_address: string;
  email_domain: string;
  email_local_specifier: string;
  email_root_domain: string;
  original_email_address: string;
}

export interface AttioPhoneNumberValueEntry
  extends AttioValueBase<'phone-number'> {
  country_code: string;
  original_phone_number: string;
  phone_number: string;
}

export interface AttioPersonalNameValueEntry
  extends AttioValueBase<'personal-name'> {
  first_name: string;
  full_name: string;
  last_name: string;
}

export interface AttioDateValueEntry extends AttioValueBase<'date'> {
  value: string;
}

export interface AttioSelectOptionId {
  attribute_id: string;
  object_id: string;
  option_id: string;
  workspace_id: string;
}

export interface AttioSelectOption {
  id: AttioSelectOptionId;
  is_archived: boolean;
  title: string;
}

export interface AttioSelectValueEntry extends AttioValueBase<'select'> {
  option: AttioSelectOption;
}

export type AttioAttributeValueEntry =
  | AttioTextValueEntry
  | AttioNumberValueEntry
  | AttioTimestampValueEntry
  | AttioDateValueEntry
  | AttioInteractionValueEntry
  | AttioRecordReferenceEntry
  | AttioLocationValueEntry
  | AttioActorReferenceEntry
  | AttioEmailAddressEntry
  | AttioPhoneNumberValueEntry
  | AttioPersonalNameValueEntry
  | AttioSelectValueEntry
  | AttioDomainValueEntry;

export type AttioValuesMap = Record<string, AttioAttributeValueEntry[]>;

export interface AttioRecordId {
  object_id: string;
  record_id: string;
  workspace_id: string;
}

export interface AttioRecordData<TValuesMap = AttioValuesMap> {
  created_at: string;
  id: AttioRecordId;
  values: TValuesMap;
  web_url: string;
}

export interface CreateRecordResponse<TValuesMap = AttioValuesMap> {
  data: AttioRecordData<TValuesMap>;
}

export interface GetRecordResponse<TValuesMap = AttioValuesMap> {
  data: AttioRecordData<TValuesMap>;
}

// Filter typings for query records
/**
 * Comparison operators supported by Attio API for filtering records.
 * See: https://developers.attio.com/reference
 */
export type AttioComparisonOperator =
  | '$eq' // Equal to
  | '$not_empty' // Has any value defined
  | '$in' // Value is in the given set
  | '$contains' // String contains (case-insensitive)
  | '$starts_with' // String starts with
  | '$ends_with' // String ends with
  | '$lt' // Less than
  | '$lte' // Less than or equal
  | '$gte' // Greater than or equal
  | '$gt'; // Greater than

/**
 * Logical operators for combining multiple filter conditions.
 */
export type AttioLogicalOperator = '$and' | '$or' | '$not';

/**
 * Basic filter condition using shorthand or verbose syntax.
 * Supports both simple equality checks and complex comparison operations.
 *
 * Examples:
 * - Shorthand: { "name": "John Smith", "email_addresses": "john@smith.com" }
 * - Verbose: { "name": { "$eq": "John Smith" }, "email_addresses": { "$contains": "@company.com" } }
 */
export interface AttioFilterCondition {
  [attribute: string]:
    | string
    | number
    | boolean
    | Array<string | number>
    | Record<string, unknown>
    | {
        [K in AttioComparisonOperator]?:
          | string
          | number
          | boolean
          | Array<string | number>;
      };
}

/**
 * Path-based filter for drilling down into related records.
 * Used for filtering by parent record attributes or complex relationships.
 *
 * Example:
 * {
 *   path: [["candidates", "parent_record"], ["people", "email_addresses"]],
 *   constraints: { "email_domain": "apple.com" }
 * }
 */
export interface AttioPathFilter {
  constraints: Record<string, unknown>;
  path: [string, string][];
}

/**
 * Logical filter for combining multiple conditions with AND, OR, NOT operators.
 *
 * Examples:
 * - AND: { "$and": [{ "stage": "In Progress" }, { "name": { "$contains": "Apple" } }] }
 * - OR: { "$or": [{ "stage": "One" }, { "stage": "Two" }] }
 * - NOT: { "$not": { "stage": "In Progress" } }
 */
export interface AttioLogicalFilter {
  $and?: AttioFilter[];
  $not?: AttioFilter;
  $or?: AttioFilter[];
}

/**
 * Union type representing all possible filter structures supported by Attio API.
 */
export type AttioFilter =
  | AttioFilterCondition
  | AttioLogicalFilter
  | AttioPathFilter;

// Helper types for common filter patterns
export interface AttioTextAttributeFilter {
  $contains?: string;
  $ends_with?: string;
  $eq?: string;
  $not_empty?: boolean;
  $starts_with?: string;
}

export interface AttioNumericAttributeFilter {
  $eq?: number;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $not_empty?: boolean;
}

export interface AttioDateAttributeFilter {
  $eq?: string;
  $gt?: string;
  $gte?: string;
  $lt?: string;
  $lte?: string;
  $not_empty?: boolean;
}

export interface AttioSelectAttributeFilter {
  $eq?: string;
  $in?: string[];
  $not_empty?: boolean;
}

export interface AttioReferenceAttributeFilter {
  $not_empty?: boolean;
  target_object?: string;
  target_record_id?: string;
}

export interface AttioEmailAttributeFilter {
  $not_empty?: boolean;
  email_address?: AttioTextAttributeFilter;
  email_domain?: AttioTextAttributeFilter;
  email_root_domain?: AttioTextAttributeFilter;
}

export interface AttioPhoneAttributeFilter {
  $not_empty?: boolean;
  country_code?: AttioTextAttributeFilter;
  phone_number?: AttioTextAttributeFilter;
}

export interface AttioLocationAttributeFilter {
  $not_empty?: boolean;
  country_code?: AttioTextAttributeFilter;
  locality?: AttioTextAttributeFilter;
  postcode?: AttioTextAttributeFilter;
  region?: AttioTextAttributeFilter;
}

// Query records typings
export type AttioSortDirection = 'asc' | 'desc';

export interface AttioQuerySort {
  attribute?: string;
  direction: AttioSortDirection;
  field?: string;
  path?: [string, string][];
}

export interface QueryRecordsRequest {
  filter?: AttioFilter;
  limit?: number;
  offset?: number;
  sorts?: AttioQuerySort[];
}

export interface QueryRecordsResponse<TValuesMap = AttioValuesMap> {
  data: AttioRecordData<TValuesMap>[];
  // Additional pagination/metadata fields are passed through as-is
  [key: string]: unknown;
}

// Attio person record value types, aligned with Attio's API payload structure
export interface AttioNameEntry {
  first_name?: string | null;
  full_name?: string | null;
  last_name?: string | null;
}

export interface AttioLinkedCompanyById {
  target_object: 'companies';
  target_record_id: string;
}

export interface AttioLinkedCompanyByDomain {
  domains: Array<{ domain: string }>;
  target_object: 'companies';
}

export type AttioCompanyLink =
  | AttioLinkedCompanyById
  | AttioLinkedCompanyByDomain;

export interface AttioPhoneNumberEntry {
  country_code?: string;
  original_phone_number: string;
}

export interface AttioAddressEntry {
  country_code?: string;
  latitude?: string | null;
  line_1?: string | null;
  line_2?: string | null;
  line_3?: string | null;
  line_4?: string | null;
  locality?: string | null;
  longitude?: string | null;
  postcode?: string | null;
  region?: string | null;
}

export interface AttioPersonValues {
  company?: AttioCompanyLink[];
  description?: string;
  email_addresses?: string[];
  linkedin?: string;
  name?: AttioNameEntry[];
  phone_numbers?: AttioPhoneNumberEntry[];
  primary_location?: AttioAddressEntry[];
  [key: string]: unknown;
}

// Attio company record value types for assert/PUT requests
export interface AttioCompanyValues {
  description?: string;
  domains?: string[];
  name?: string;
  primary_location?: string;
  team?: string[];
  [key: string]: unknown;
}

export interface AttioDomainValueEntry extends AttioValueBase<'domain'> {
  domain: string;
  root_domain: string;
}

export interface AttioCompanyRecordValues {
  description?: AttioTextValueEntry[];
  domains?: AttioDomainValueEntry[];
  name?: AttioTextValueEntry[];
  primary_location?: AttioLocationValueEntry[];
  team?: AttioRecordReferenceEntry[];
  [key: string]: AttioAttributeValueEntry[] | undefined;
}

export interface AttioPersonRecordValues {
  company?: AttioRecordReferenceEntry[];
  description?: AttioTextValueEntry[];
  email_addresses?: AttioEmailAddressEntry[];
  linkedin?: AttioTextValueEntry[];
  name?: AttioPersonalNameValueEntry[];
  phone_numbers?: AttioPhoneNumberValueEntry[];
  primary_location?: AttioLocationValueEntry[];
  [key: string]: AttioAttributeValueEntry[] | undefined;
}

export class AttioAPI {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(params: { baseUrl?: string; apiKey: string }) {
    this.baseUrl = params.baseUrl ?? DEFAULT_ATTIO_BASE_URL;
    this.apiKey = params.apiKey;
  }

  async getObject(object: AttioObjectSlug): Promise<AttioObjectMeta> {
    const res = await this.request<{ data: AttioObjectMeta }>(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}`,
      { retries: ATTIO_IDEMPOTENT_RETRY_COUNT }
    );
    return res.data;
  }

  async assertRecord<
    TRequestValues extends Record<string, unknown>,
    TValuesMap = AttioValuesMap,
  >(
    object: AttioObjectSlug,
    values: TRequestValues
  ): Promise<CreateRecordResponse<TValuesMap>> {
    return await this.request<CreateRecordResponse<TValuesMap>>(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records`,
      {
        init: {
          body: JSON.stringify({ data: { values } }),
          method: 'PUT',
        },
        retries: ATTIO_IDEMPOTENT_RETRY_COUNT,
      }
    );
  }

  async createRecord<
    TRequestValues extends Record<string, unknown>,
    TValuesMap = AttioValuesMap,
  >(
    object: AttioObjectSlug,
    values: TRequestValues
  ): Promise<CreateRecordResponse<TValuesMap>> {
    return await this.request<CreateRecordResponse<TValuesMap>>(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records`,
      {
        init: {
          body: JSON.stringify({ data: { values } }),
          method: 'POST',
        },
      }
    );
  }

  async getRecord<TValues extends Record<string, unknown>>(
    object: AttioObjectSlug,
    recordId: string
  ): Promise<GetRecordResponse<TValues>> {
    return await this.request<GetRecordResponse<TValues>>(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
      { retries: ATTIO_IDEMPOTENT_RETRY_COUNT }
    );
  }

  async upsertCompanyRecord(values: AttioCompanyValues) {
    const payload: Record<string, unknown> = { ...values };
    return await this.assertRecord<
      AttioCompanyValues,
      AttioCompanyRecordValues
    >('companies', payload);
  }

  async createCompanyRecord(values: AttioCompanyValues) {
    const payload: Record<string, unknown> = { ...values };
    return await this.createRecord<
      AttioCompanyValues,
      AttioCompanyRecordValues
    >('companies', payload);
  }

  async upsertPersonRecord(values: AttioPersonValues) {
    const payload: Record<string, unknown> = { ...values };
    return await this.assertRecord<AttioPersonValues, AttioPersonRecordValues>(
      'people',
      payload
    );
  }

  async queryRecords<TValuesMap = AttioValuesMap>(
    object: AttioObjectSlug,
    query: QueryRecordsRequest
  ): Promise<QueryRecordsResponse<TValuesMap>> {
    return await this.request<QueryRecordsResponse<TValuesMap>>(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records/query`,
      {
        init: {
          body: JSON.stringify(query),
          method: 'POST',
        },
        retries: ATTIO_IDEMPOTENT_RETRY_COUNT,
      }
    );
  }

  async queryCompanyRecords(
    query: QueryRecordsRequest
  ): Promise<QueryRecordsResponse<AttioCompanyRecordValues>> {
    return this.queryRecords<AttioCompanyRecordValues>('companies', query);
  }

  async queryPersonRecords(
    query: QueryRecordsRequest
  ): Promise<QueryRecordsResponse<AttioPersonRecordValues>> {
    return this.queryRecords<AttioPersonRecordValues>('people', query);
  }

  private async request<T>(
    url: string,
    options?: {
      init?: RequestInit;
      retries?: number;
    }
  ): Promise<T> {
    const init = options?.init;
    const res = await fetchExt({
      init: {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          ...init?.headers,
        },
      },
      retries: options?.retries ?? 0,
      retryDelay: ATTIO_RETRY_DELAY_MS,
      retryOnHttpStatuses: [...ATTIO_RETRY_HTTP_STATUSES],
      timeout: ATTIO_REQUEST_TIMEOUT_MS,
      url,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Attio API error ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}
