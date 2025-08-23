const DEFAULT_ATTIO_BASE_URL = 'https://api.attio.com/v2';

export type AttioObjectSlug = 'people' | 'companies' | string;

export interface AttioObjectMeta {
  id: string;
  name: string;
  slug: string;
  attributes: Array<{
    id: string;
    slug: string;
    type: string;
    label?: string;
    required?: boolean;
  }>;
}

// Common response typings for Attio record APIs
export interface AttioActor {
  type: 'system' | 'workspace-member';
  id: string | null;
}

export interface AttioValueBase<TAttributeType extends string> {
  active_from: string;
  active_until: string | null;
  created_by_actor: AttioActor;
  attribute_type: TAttributeType;
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

export interface AttioInteractionValueEntry extends AttioValueBase<'interaction'> {
  interaction_type: string;
  interacted_at: string;
  owner_actor: AttioActor;
}

export interface AttioRecordReferenceEntry extends AttioValueBase<'record-reference'> {
  target_object: string;
  target_record_id: string;
}

export interface AttioLocationValueEntry extends AttioValueBase<'location'> {
  line_1: string | null;
  line_2: string | null;
  line_3: string | null;
  line_4: string | null;
  locality: string | null;
  region: string | null;
  postcode: string | null;
  country_code: string;
  latitude: string | null;
  longitude: string | null;
}

export interface AttioActorReferenceEntry extends AttioValueBase<'actor-reference'> {
  referenced_actor_type: 'workspace-member' | string;
  referenced_actor_id: string;
}

export interface AttioEmailAddressEntry extends AttioValueBase<'email-address'> {
  original_email_address: string;
  email_address: string;
  email_domain: string;
  email_root_domain: string;
  email_local_specifier: string;
}

export interface AttioPhoneNumberValueEntry extends AttioValueBase<'phone-number'> {
  country_code: string;
  original_phone_number: string;
  phone_number: string;
}

export interface AttioPersonalNameValueEntry extends AttioValueBase<'personal-name'> {
  first_name: string;
  last_name: string;
  full_name: string;
}

export interface AttioDateValueEntry extends AttioValueBase<'date'> {
  value: string;
}

export interface AttioSelectOptionId {
  workspace_id: string;
  object_id: string;
  attribute_id: string;
  option_id: string;
}

export interface AttioSelectOption {
  id: AttioSelectOptionId;
  title: string;
  is_archived: boolean;
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
  workspace_id: string;
  object_id: string;
  record_id: string;
}

export interface AttioRecordData<TValuesMap = AttioValuesMap> {
  id: AttioRecordId;
  created_at: string;
  web_url: string;
  values: TValuesMap;
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
  | '$eq'        // Equal to
  | '$not_empty' // Has any value defined
  | '$in'        // Value is in the given set
  | '$contains'  // String contains (case-insensitive)
  | '$starts_with' // String starts with
  | '$ends_with'   // String ends with
  | '$lt'        // Less than
  | '$lte'       // Less than or equal
  | '$gte'       // Greater than or equal
  | '$gt';       // Greater than

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
    [K in AttioComparisonOperator]?: string | number | boolean | Array<string | number>;
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
  path: Array<[string, string]>;
  constraints: Record<string, unknown>;
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
  $or?: AttioFilter[];
  $not?: AttioFilter;
}

/**
 * Union type representing all possible filter structures supported by Attio API.
 */
export type AttioFilter = AttioFilterCondition | AttioLogicalFilter | AttioPathFilter;

// Helper types for common filter patterns
export interface AttioTextAttributeFilter {
  $eq?: string;
  $contains?: string;
  $starts_with?: string;
  $ends_with?: string;
  $not_empty?: boolean;
}

export interface AttioNumericAttributeFilter {
  $eq?: number;
  $lt?: number;
  $lte?: number;
  $gte?: number;
  $gt?: number;
  $not_empty?: boolean;
}

export interface AttioDateAttributeFilter {
  $eq?: string;
  $lt?: string;
  $lte?: string;
  $gte?: string;
  $gt?: string;
  $not_empty?: boolean;
}

export interface AttioSelectAttributeFilter {
  $eq?: string;
  $in?: string[];
  $not_empty?: boolean;
}

export interface AttioReferenceAttributeFilter {
  target_object?: string;
  target_record_id?: string;
  $not_empty?: boolean;
}

export interface AttioEmailAttributeFilter {
  email_address?: AttioTextAttributeFilter;
  email_domain?: AttioTextAttributeFilter;
  email_root_domain?: AttioTextAttributeFilter;
  $not_empty?: boolean;
}

export interface AttioPhoneAttributeFilter {
  phone_number?: AttioTextAttributeFilter;
  country_code?: AttioTextAttributeFilter;
  $not_empty?: boolean;
}

export interface AttioLocationAttributeFilter {
  locality?: AttioTextAttributeFilter;
  region?: AttioTextAttributeFilter;
  postcode?: AttioTextAttributeFilter;
  country_code?: AttioTextAttributeFilter;
  $not_empty?: boolean;
}

// Query records typings
export type AttioSortDirection = 'asc' | 'desc';

export interface AttioQuerySort {
  direction: AttioSortDirection;
  attribute?: string;
  field?: string;
  path?: Array<[string, string]>;
}

export interface QueryRecordsRequest {
  filter?: AttioFilter;
  sorts?: AttioQuerySort[];
  limit?: number;
  offset?: number;
}

export interface QueryRecordsResponse<TValuesMap = AttioValuesMap> {
  data: AttioRecordData<TValuesMap>[];
  // Additional pagination/metadata fields are passed through as-is
  [key: string]: unknown;
}

// Attio person record value types, aligned with Attio's API payload structure
export interface AttioNameEntry {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
}

export interface AttioLinkedCompanyById {
  target_object: 'companies';
  target_record_id: string;
}

export interface AttioLinkedCompanyByDomain {
  target_object: 'companies';
  domains: Array<{ domain: string }>;
}

export type AttioCompanyLink = AttioLinkedCompanyById | AttioLinkedCompanyByDomain;

export interface AttioPhoneNumberEntry {
  original_phone_number: string;
  country_code?: string;
}

export interface AttioAddressEntry {
  line_1?: string | null;
  line_2?: string | null;
  line_3?: string | null;
  line_4?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  country_code?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface AttioPersonValues {
  email_addresses?: string[];
  name?: AttioNameEntry[];
  description?: string;
  company?: AttioCompanyLink[];
  phone_numbers?: AttioPhoneNumberEntry[];
  primary_location?: AttioAddressEntry[];
  linkedin?: string;
  [key: string]: unknown;
}

// Attio company record value types for assert/PUT requests
export interface AttioCompanyValues {
  name?: string;
  description?: string;
  domains?: string[];
  team?: string[];
  primary_location?: string;
  [key: string]: unknown;
}

export interface AttioDomainValueEntry extends AttioValueBase<'domain'> {
  domain: string;
  root_domain: string;
}

export interface AttioCompanyRecordValues {
  [key: string]: AttioAttributeValueEntry[] | undefined;
  domains?: AttioDomainValueEntry[];
  name?: AttioTextValueEntry[];
  description?: AttioTextValueEntry[];
  team?: AttioRecordReferenceEntry[];
  primary_location?: AttioLocationValueEntry[];
}

export interface AttioPersonRecordValues {
  [key: string]: AttioAttributeValueEntry[] | undefined;
  email_addresses?: AttioEmailAddressEntry[];
  name?: AttioPersonalNameValueEntry[];
  description?: AttioTextValueEntry[];
  company?: AttioRecordReferenceEntry[];
  phone_numbers?: AttioPhoneNumberValueEntry[];
  primary_location?: AttioLocationValueEntry[];
  linkedin?: AttioTextValueEntry[];
}

export class AttioAPI {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(params: { baseUrl?: string; apiKey: string }) {
    this.baseUrl = params.baseUrl ?? DEFAULT_ATTIO_BASE_URL;
    this.apiKey = params.apiKey;
  }

  async getObject(object: AttioObjectSlug): Promise<AttioObjectMeta> {
    const res = await this.request(`${this.baseUrl}/objects/${encodeURIComponent(object)}`);
    return res.data as AttioObjectMeta;
  }

  async assertRecord<TRequestValues extends Record<string, unknown>, TValuesMap = AttioValuesMap>(
    object: AttioObjectSlug,
    values: TRequestValues
  ): Promise<CreateRecordResponse<TValuesMap>> {
    const res = await this.request(`${this.baseUrl}/objects/${encodeURIComponent(object)}/records`, {
      method: 'PUT',
      body: JSON.stringify({ data: { values } }),
    });
    return res as CreateRecordResponse<TValuesMap>;
  }

  async createRecord<TRequestValues extends Record<string, unknown>, TValuesMap = AttioValuesMap>(
    object: AttioObjectSlug,
    values: TRequestValues
  ): Promise<CreateRecordResponse<TValuesMap>> {
    const res = await this.request(`${this.baseUrl}/objects/${encodeURIComponent(object)}/records`, {
      method: 'POST',
      body: JSON.stringify({ data: { values } }),
    });
    return res as CreateRecordResponse<TValuesMap>;
  }

  async getRecord<TValues extends Record<string, unknown>>(
    object: AttioObjectSlug,
    recordId: string
  ): Promise<GetRecordResponse<TValues>> {
    const res = await this.request(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`
    );
    return res as GetRecordResponse<TValues>;
  }

  async upsertCompanyRecord(
    values: AttioCompanyValues
  ) {
    const payload: Record<string, unknown> = { ...values };
    return await this.assertRecord<AttioCompanyValues, AttioCompanyRecordValues>('companies', payload);
  }

  async createCompanyRecord(
    values: AttioCompanyValues
  ) {
    const payload: Record<string, unknown> = { ...values };
    return await this.createRecord<AttioCompanyValues, AttioCompanyRecordValues>('companies', payload);
  }

  async upsertPersonRecord(
    values: AttioPersonValues
  ) {
    const payload: Record<string, unknown> = { ...values };
    return await this.assertRecord<AttioPersonValues, AttioPersonRecordValues>('people', payload);
  }

  async queryRecords<TValuesMap = AttioValuesMap>(
    object: AttioObjectSlug,
    query: QueryRecordsRequest
  ): Promise<QueryRecordsResponse<TValuesMap>> {
    const res = await this.request(
      `${this.baseUrl}/objects/${encodeURIComponent(object)}/records/query`,
      {
        method: 'POST',
        body: JSON.stringify(query),
      }
    );
    return res as QueryRecordsResponse<TValuesMap>;
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

  private async request(url: string, init?: RequestInit): Promise<any> {
    const res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Attio API error ${res.status}: ${text}`);
    }
    return await res.json();
  }
}
