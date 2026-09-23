import { CustomError } from '../../utils/custom-error';

/** Failures detected by Edge Kit. API failures retain the SDK's error types. */
export type NotionErrorCode =
  | 'invalid_response'
  | 'repeated_cursor'
  | 'incomplete_content'
  | 'ambiguous_data_source'
  | 'missing_data_source'
  | 'block_limit'
  | 'block_cycle'
  | 'read_only'
  | 'invalid_configuration'
  | 'unsupported_filter';

/** Inspect `code` to handle content, pagination, or policy failures. */
export class NotionError extends CustomError<NotionErrorCode> {}
