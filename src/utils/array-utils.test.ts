import { describe, expect, it } from 'vitest';

import { groupMapBy, mapBy } from './array-utils';

describe('mapBy', () => {
  it('maps input values by a string key when no transform is provided', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1' },
      { id: 'b', organizationId: 'org-2' },
    ];

    const mapped = mapBy(rows, { key: (row) => row.id });

    expect(mapped.get('a')).toEqual({ id: 'a', organizationId: 'org-1' });
    expect(mapped.get('b')).toEqual({ id: 'b', organizationId: 'org-2' });
  });

  it('maps transformed values by a string key on the transformed value', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1', name: 'Ada' },
      { id: 'b', organizationId: 'org-2', name: 'Linus' },
    ];

    const mapped = mapBy(rows, {
      transform: (row) => ({
        orgId: row.organizationId,
        label: `${row.name}:${row.id}`,
      }),
      key: (value) => value.orgId,
    });

    expect(mapped.get('org-1')).toEqual({ orgId: 'org-1', label: 'Ada:a' });
    expect(mapped.get('org-2')).toEqual({ orgId: 'org-2', label: 'Linus:b' });
  });

  it('filters source items before transforming values', () => {
    const rows = [
      { active: true, id: 'a', organizationId: 'org-1' },
      { active: false, id: 'b', organizationId: 'org-1' },
      { active: true, id: 'c', organizationId: 'org-2' },
    ];
    const transformedIds: string[] = [];

    const mapped = mapBy(rows, {
      include: (row) => row.active,
      transform: (row) => {
        transformedIds.push(row.id);
        return {
          orgId: row.organizationId,
          rowId: row.id,
        };
      },
      key: (value) => value.orgId,
    });

    expect(transformedIds).toEqual(['a', 'c']);
    expect(mapped.get('org-1')).toEqual({ orgId: 'org-1', rowId: 'a' });
    expect(mapped.get('org-2')).toEqual({ orgId: 'org-2', rowId: 'c' });
  });

  it('uses the last value for duplicate keys by default', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1' },
      { id: 'b', organizationId: 'org-1' },
    ];

    const mapped = mapBy(rows, { key: (row) => row.organizationId });

    expect(mapped.get('org-1')).toEqual({ id: 'b', organizationId: 'org-1' });
  });

  it('uses resolveDuplicate to control duplicate keys', () => {
    const rows = [
      { count: 1, organizationId: 'org-1' },
      { count: 3, organizationId: 'org-1' },
      { count: 5, organizationId: 'org-2' },
    ];

    const mapped = mapBy(rows, {
      key: (row) => row.organizationId,
      resolveDuplicate: (existing, next, key) => ({
        count: existing.count + next.count,
        organizationId: key,
      }),
    });

    expect(mapped.get('org-1')).toEqual({ count: 4, organizationId: 'org-1' });
    expect(mapped.get('org-2')).toEqual({ count: 5, organizationId: 'org-2' });
  });
});

describe('groupMapBy', () => {
  it('groups input values by a string key when no transform is provided', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1' },
      { id: 'b', organizationId: 'org-2' },
      { id: 'c', organizationId: 'org-1' },
    ];

    const grouped = groupMapBy(rows, { key: (row) => row.organizationId });

    expect(grouped.get('org-1')).toEqual([
      { id: 'a', organizationId: 'org-1' },
      { id: 'c', organizationId: 'org-1' },
    ]);
    expect(grouped.get('org-2')).toEqual([
      { id: 'b', organizationId: 'org-2' },
    ]);
  });

  it('groups transformed values by a string key on the transformed value', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1', name: 'Ada' },
      { id: 'b', organizationId: 'org-2', name: 'Linus' },
      { id: 'c', organizationId: 'org-1', name: 'Grace' },
    ];

    const grouped = groupMapBy(rows, {
      transform: (row) => ({
        orgId: row.organizationId,
        label: `${row.name}:${row.id}`,
      }),
      key: (value) => value.orgId,
    });

    expect(grouped.get('org-1')).toEqual([
      { orgId: 'org-1', label: 'Ada:a' },
      { orgId: 'org-1', label: 'Grace:c' },
    ]);
    expect(grouped.get('org-2')).toEqual([
      { orgId: 'org-2', label: 'Linus:b' },
    ]);
  });

  it('returns an empty map for empty input', () => {
    const grouped = groupMapBy([], {
      transform: (row: { groupId: string }) => row,
      key: (value) => value.groupId,
    });

    expect(grouped.size).toBe(0);
  });

  it('filters source items before transforming values', () => {
    const rows = [
      { active: true, id: 'a', organizationId: 'org-1' },
      { active: false, id: 'b', organizationId: 'org-1' },
      { active: true, id: 'c', organizationId: 'org-2' },
    ];
    const transformedIds: string[] = [];

    const grouped = groupMapBy(rows, {
      include: (row) => row.active,
      transform: (row) => {
        transformedIds.push(row.id);
        return {
          orgId: row.organizationId,
          rowId: row.id,
        };
      },
      key: (value) => value.orgId,
    });

    expect(transformedIds).toEqual(['a', 'c']);
    expect(grouped.get('org-1')).toEqual([{ orgId: 'org-1', rowId: 'a' }]);
    expect(grouped.get('org-2')).toEqual([{ orgId: 'org-2', rowId: 'c' }]);
  });

  it('accumulates duplicate keys into arrays', () => {
    const rows = [
      { id: 'a', organizationId: 'org-1' },
      { id: 'b', organizationId: 'org-1' },
      { id: 'c', organizationId: 'org-2' },
    ];

    const grouped = groupMapBy(rows, { key: (row) => row.organizationId });

    expect(grouped.get('org-1')).toEqual([
      { id: 'a', organizationId: 'org-1' },
      { id: 'b', organizationId: 'org-1' },
    ]);
    expect(grouped.get('org-2')).toEqual([
      { id: 'c', organizationId: 'org-2' },
    ]);
  });
});
