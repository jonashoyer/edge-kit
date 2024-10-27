export interface WaitlistEntry {
  email: string;
  joinedAt: string;
  metadata?: Record<string, any>;
}

export abstract class AbstractWaitlistService {
  abstract join(email: string, metadata?: Record<string, any>): Promise<number>;
  abstract getPosition(email: string): Promise<number | null>;
  abstract getEntryCount(): Promise<number>;
  abstract isOnWaitlist(email: string): Promise<boolean>;
  abstract getEntries(limit: number, offset: number): Promise<WaitlistEntry[]>;
  abstract removeEntries(emails: string[]): Promise<void>;
}
