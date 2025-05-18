# Waitlist Services

Edge Kit provides a waitlist management system that allows you to create and manage waitlists for your application, track user positions, and handle invite processes.

## Overview

The waitlist services allow you to:
- Add users to a waitlist
- Check a user's position in the waitlist
- Get the total number of users on the waitlist
- Retrieve batches of waitlist entries
- Remove users from the waitlist

## Abstract Waitlist Service

The `AbstractWaitlistService` class defines the interface that all waitlist implementations must follow:

```typescript
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
```

## Available Implementations

Edge Kit provides the following waitlist implementations:

### KeyValueWaitlistService

A waitlist implementation using a key-value store (like Redis) as the backend.

**Location**: `src/services/waitlist/key-value-waitlist.ts`

**Dependencies**:
- An implementation of `AbstractKeyValueService` (like Upstash Redis or ioredis)
- `NamespaceComposer` for key management

**Usage**:

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';
import { KeyValueWaitlistService } from '../services/waitlist/key-value-waitlist';

// Create a key-value service
const kv = new UpstashRedisKeyValueService(
  process.env.UPSTASH_REDIS_URL!,
  process.env.UPSTASH_REDIS_TOKEN!
);

// Create the waitlist service
const waitlist = new KeyValueWaitlistService(kv);

// Add a user to the waitlist
const position = await waitlist.join('user@example.com', {
  name: 'John Doe',
  referredBy: 'existing-user@example.com',
});

console.log(`You're #${position + 1} on our waitlist!`);
```

## Common Operations

### Adding Users to the Waitlist

```typescript
// Add a user with basic information
const position = await waitlist.join('user@example.com');

// Add a user with additional metadata
const position = await waitlist.join('user@example.com', {
  name: 'John Doe',
  source: 'product-hunt',
  referredBy: 'existing-user@example.com',
  preferences: {
    newsletters: true,
    productUpdates: true,
  },
});
```

### Checking Waitlist Position

```typescript
// Get a user's position (0-based index)
const position = await waitlist.getPosition('user@example.com');

// Display a 1-based position to the user
if (position !== null) {
  console.log(`You are #${position + 1} on our waitlist!`);
} else {
  console.log('You are not on our waitlist yet.');
}
```

### Managing the Waitlist

```typescript
// Check if a user is on the waitlist
const isOnWaitlist = await waitlist.isOnWaitlist('user@example.com');

// Get the total number of users on the waitlist
const totalUsers = await waitlist.getEntryCount();

// Get a batch of users (pagination)
const firstPage = await waitlist.getEntries(10, 0); // First 10 users
const secondPage = await waitlist.getEntries(10, 10); // Next 10 users

// Remove users from the waitlist (e.g., when invited)
await waitlist.removeEntries(['user1@example.com', 'user2@example.com']);
```

## Waitlist Management Workflow

### Building a Waitlist Form

```typescript
// React component example
function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  
  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('submitting');
    
    try {
      const position = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, source }),
      }).then(res => res.json()).then(data => data.position);
      
      setStatus('success');
      setEmail('');
      setName('');
      setSource('');
      
      alert(`Thank you! You're #${position + 1} on our waitlist.`);
    } catch (error) {
      setStatus('error');
      alert('Failed to join waitlist. Please try again.');
    }
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <h2>Join our Waitlist</h2>
      
      <div>
        <label htmlFor="email">Email</label>
        <input 
          type="email" 
          id="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>
      
      <div>
        <label htmlFor="name">Name</label>
        <input 
          type="text" 
          id="name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      
      <div>
        <label htmlFor="source">How did you hear about us?</label>
        <select 
          id="source"
          value={source}
          onChange={e => setSource(e.target.value)}
        >
          <option value="">Select an option...</option>
          <option value="friend">Friend or colleague</option>
          <option value="social">Social media</option>
          <option value="search">Search engine</option>
          <option value="blog">Blog or article</option>
        </select>
      </div>
      
      <button 
        type="submit" 
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? 'Joining...' : 'Join Waitlist'}
      </button>
    </form>
  );
}
```

### API Route for Joining the Waitlist

```typescript
// Next.js API route example
import { NextApiRequest, NextApiResponse } from 'next';
import { UpstashRedisKeyValueService } from '../../services/key-value/upstash-redis-key-value';
import { KeyValueWaitlistService } from '../../services/waitlist/key-value-waitlist';

// Create services (ideally in a separate file and reused)
const kv = new UpstashRedisKeyValueService(
  process.env.UPSTASH_REDIS_URL!,
  process.env.UPSTASH_REDIS_TOKEN!
);
const waitlist = new KeyValueWaitlistService(kv);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { email, name, source } = req.body;
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  
  try {
    // Add to waitlist and get position
    const position = await waitlist.join(email, {
      name: name || undefined,
      source: source || undefined,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      joinedAt: new Date().toISOString(),
    });
    
    // Notify internal team (optional)
    // await notifyTeam(email, position);
    
    return res.status(200).json({ success: true, position });
  } catch (error) {
    console.error('Waitlist join error:', error);
    return res.status(500).json({ error: 'Failed to join waitlist' });
  }
}
```

### Admin Dashboard for Managing the Waitlist

```typescript
// React component example
function WaitlistAdmin() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const entriesPerPage = 20;
  
  // Load waitlist entries
  useEffect(() => {
    async function loadEntries() {
      const response = await fetch(`/api/admin/waitlist?limit=${entriesPerPage}&offset=${page * entriesPerPage}`);
      const data = await response.json();
      
      setEntries(data.entries);
      setTotalEntries(data.total);
    }
    
    loadEntries();
  }, [page]);
  
  // Toggle selection of an entry
  function toggleSelect(email) {
    if (selectedEmails.includes(email)) {
      setSelectedEmails(selectedEmails.filter(e => e !== email));
    } else {
      setSelectedEmails([...selectedEmails, email]);
    }
  }
  
  // Invite selected users
  async function inviteSelected() {
    if (!selectedEmails.length) return;
    
    if (!confirm(`Are you sure you want to invite ${selectedEmails.length} users?`)) {
      return;
    }
    
    try {
      // Send invites
      await fetch('/api/admin/waitlist/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: selectedEmails }),
      });
      
      // Remove from waitlist
      await fetch('/api/admin/waitlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: selectedEmails }),
      });
      
      // Refresh the list
      const response = await fetch(`/api/admin/waitlist?limit=${entriesPerPage}&offset=${page * entriesPerPage}`);
      const data = await response.json();
      
      setEntries(data.entries);
      setTotalEntries(data.total);
      setSelectedEmails([]);
      
      alert('Invites sent successfully!');
    } catch (error) {
      console.error('Failed to invite users:', error);
      alert('Failed to invite users. Please try again.');
    }
  }
  
  return (
    <div>
      <h1>Waitlist Management</h1>
      <p>Total users on waitlist: {totalEntries}</p>
      
      <div className="actions">
        <button onClick={inviteSelected} disabled={!selectedEmails.length}>
          Invite Selected ({selectedEmails.length})
        </button>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>
              <input 
                type="checkbox" 
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedEmails(entries.map(entry => entry.email));
                  } else {
                    setSelectedEmails([]);
                  }
                }}
                checked={selectedEmails.length === entries.length && entries.length > 0}
              />
            </th>
            <th>Email</th>
            <th>Name</th>
            <th>Joined</th>
            <th>Source</th>
            <th>Position</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.email}>
              <td>
                <input 
                  type="checkbox"
                  checked={selectedEmails.includes(entry.email)}
                  onChange={() => toggleSelect(entry.email)}
                />
              </td>
              <td>{entry.email}</td>
              <td>{entry.metadata?.name || '-'}</td>
              <td>{new Date(entry.joinedAt).toLocaleDateString()}</td>
              <td>{entry.metadata?.source || '-'}</td>
              <td>{page * entriesPerPage + index + 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="pagination">
        <button 
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Previous
        </button>
        <span>Page {page + 1} of {Math.ceil(totalEntries / entriesPerPage)}</span>
        <button 
          onClick={() => setPage(p => p + 1)}
          disabled={(page + 1) * entriesPerPage >= totalEntries}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

## Best Practices

1. **Email Validation**: Always validate email addresses before adding to the waitlist:

```typescript
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function joinWaitlist(email: string, metadata?: Record<string, any>): Promise<number> {
  if (!isValidEmail(email)) {
    throw new Error('Invalid email address');
  }
  
  return await waitlist.join(email, metadata);
}
```

2. **Duplicate Prevention**: Handle duplicate join attempts gracefully:

```typescript
async function joinWaitlist(email: string, metadata?: Record<string, any>): Promise<{ position: number; isNew: boolean }> {
  // Check if already on waitlist
  const isOnWaitlist = await waitlist.isOnWaitlist(email);
  
  if (isOnWaitlist) {
    // Get current position
    const position = await waitlist.getPosition(email) || 0;
    return { position, isNew: false };
  }
  
  // Add to waitlist
  const position = await waitlist.join(email, metadata);
  return { position, isNew: true };
}
```

3. **Position Formatting**: Display positions in a user-friendly format:

```typescript
function formatPosition(position: number): string {
  // Convert 0-based index to 1-based position
  const displayPosition = position + 1;
  
  // Add ordinal suffix
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = displayPosition % 100;
  const suffix = 
    (remainder >= 11 && remainder <= 13) ? 'th' : 
    suffixes[displayPosition % 10] || 'th';
  
  return `${displayPosition}${suffix}`;
}

// Usage
const position = await waitlist.getPosition('user@example.com');
console.log(`You're in ${formatPosition(position!)} place!`); // "You're in 42nd place!"
```

4. **Rate Limiting**: Implement rate limiting for waitlist sign-ups:

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';
import { KeyValueWaitlistService } from '../services/waitlist/key-value-waitlist';

// Create services
const kv = new UpstashRedisKeyValueService(/* config */);
const waitlist = new KeyValueWaitlistService(kv);

// Rate limiting function
async function rateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:waitlist:${ip}`;
  const count = await kv.increment(key);
  
  // Set TTL on first increment
  if (count === 1) {
    await kv.expire(key, 3600); // 1 hour TTL
  }
  
  // Allow 5 attempts per hour
  return count <= 5;
}

// Usage in API route
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  // Check rate limit
  const allowed = await rateLimit(ip as string);
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  // Process waitlist join
  // ...
}
```

5. **Referral Tracking**: Track and reward referrals:

```typescript
async function joinWithReferral(email: string, referrerEmail?: string): Promise<number> {
  // Join waitlist
  const position = await waitlist.join(email, { 
    referredBy: referrerEmail,
  });
  
  // If there's a referrer, update their metadata to track the referral
  if (referrerEmail && await waitlist.isOnWaitlist(referrerEmail)) {
    // Get referrer's entry
    const referrerEntries = await waitlist.getEntries(1, await waitlist.getPosition(referrerEmail) || 0);
    
    if (referrerEntries.length > 0) {
      const referrer = referrerEntries[0];
      
      // Update referrer's metadata
      const referrals = referrer.metadata?.referrals || [];
      referrals.push(email);
      
      // Remove and re-add with updated metadata
      await waitlist.removeEntries([referrerEmail]);
      await waitlist.join(referrerEmail, {
        ...referrer.metadata,
        referrals,
        // Adjust position for each referral
        bonusPoints: referrals.length,
      });
    }
  }
  
  return position;
}
```

## Custom Implementations

You can create your own waitlist implementation by extending the `AbstractWaitlistService` class:

```typescript
import { AbstractWaitlistService, WaitlistEntry } from '../services/waitlist/abstract-waitlist';
import { PrismaClient } from '@prisma/client';

// Example implementation using Prisma ORM
export class PrismaWaitlistService extends AbstractWaitlistService {
  constructor(private prisma: PrismaClient) {
    super();
  }
  
  async join(email: string, metadata?: Record<string, any>): Promise<number> {
    // Check if already on waitlist
    const existingEntry = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });
    
    if (existingEntry) {
      // Return existing position
      return await this.getPosition(email) || 0;
    }
    
    // Create new entry
    await this.prisma.waitlistEntry.create({
      data: {
        email,
        joinedAt: new Date().toISOString(),
        metadata: metadata || {},
      },
    });
    
    // Get and return position
    return await this.getPosition(email) || 0;
  }
  
  async getPosition(email: string): Promise<number | null> {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { email },
    });
    
    if (!entry) return null;
    
    // Count entries that joined before this one
    const position = await this.prisma.waitlistEntry.count({
      where: {
        joinedAt: {
          lt: entry.joinedAt,
        },
      },
    });
    
    return position;
  }
  
  async getEntryCount(): Promise<number> {
    return await this.prisma.waitlistEntry.count();
  }
  
  async isOnWaitlist(email: string): Promise<boolean> {
    const count = await this.prisma.waitlistEntry.count({
      where: { email },
    });
    
    return count > 0;
  }
  
  async getEntries(limit: number, offset: number): Promise<WaitlistEntry[]> {
    const entries = await this.prisma.waitlistEntry.findMany({
      orderBy: { joinedAt: 'asc' },
      skip: offset,
      take: limit,
    });
    
    return entries.map(entry => ({
      email: entry.email,
      joinedAt: entry.joinedAt,
      metadata: entry.metadata as Record<string, any>,
    }));
  }
  
  async removeEntries(emails: string[]): Promise<void> {
    await this.prisma.waitlistEntry.deleteMany({
      where: {
        email: {
          in: emails,
        },
      },
    });
  }
}
```
