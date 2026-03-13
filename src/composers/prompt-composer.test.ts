import { DELIMITERS } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { PromptComposer } from './prompt-composer';

describe('prompt-composer', () => {
  describe('format', () => {
    it('defaults to TOON for primitive arrays', () => {
      const result = PromptComposer.format(['ana', 'luis', 'sam']);

      expect(result).toBe('[3]: ana,luis,sam');
    });

    it('formats flat objects as TOON', () => {
      const result = PromptComposer.format({
        name: 'Alice',
        role: 'Engineer',
      });

      expect(result).toBe('name: Alice\nrole: Engineer');
    });

    it('formats uniform arrays of objects as TOON tables', () => {
      const result = PromptComposer.format([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);

      expect(result).toBe('[2]{id,name}:\n  1,Alice\n  2,Bob');
    });

    it('formats nested mixed structures as TOON', () => {
      const result = PromptComposer.format({
        team: { name: 'Edge', active: true },
        members: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        tags: ['prompt', 'toon'],
      });

      expect(result).toBe(
        [
          'team:',
          '  name: Edge',
          '  active: true',
          'members[2]{id,name}:',
          '  1,Alice',
          '  2,Bob',
          'tags[2]: prompt,toon',
        ].join('\n')
      );
    });

    it('passes through custom TOON delimiters', () => {
      const result = PromptComposer.format(
        [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        {
          toon: { delimiter: DELIMITERS.pipe },
        }
      );

      expect(result).toBe('[2|]{id|name}:\n  1|Alice\n  2|Bob');
    });

    it('passes through TOON key folding', () => {
      const result = PromptComposer.format(
        {
          data: {
            metadata: {
              items: [{ id: 1 }, { id: 2 }],
            },
          },
        },
        {
          toon: { keyFolding: 'safe' },
        }
      );

      expect(result).toBe('data.metadata.items[2]{id}:\n  1\n  2');
    });

    it('passes through TOON replacers', () => {
      const result = PromptComposer.format(
        {
          id: 1,
          name: 'Alice',
          secret: 'hide',
        },
        {
          toon: {
            replacer: (key, value) => {
              if (key === 'secret') {
                return undefined;
              }

              return value;
            },
          },
        }
      );

      expect(result).toBe('id: 1\nname: Alice');
    });

    it('supports XML formatting', () => {
      const result = PromptComposer.format(
        {
          team: { name: 'Edge' },
          members: ['Alice', 'Bob'],
        },
        {
          format: 'xml',
          rootName: 'payload',
        }
      );

      expect(result).toBe(
        [
          '<payload>',
          '  <team>',
          '    <name>Edge</name>',
          '  </team>',
          '  <members>Alice</members>',
          '  <members>Bob</members>',
          '</payload>',
        ].join('\n')
      );
    });

    it('supports legacy list formatting', () => {
      const result = PromptComposer.format(['alpha', 'beta'], {
        format: 'list',
      });

      expect(result).toBe('- alpha\n- beta');
    });

    it('supports legacy keyValue formatting', () => {
      const result = PromptComposer.format(
        {
          name: 'Alice',
          count: 3,
        },
        {
          format: 'keyValue',
        }
      );

      expect(result).toBe('name: Alice\ncount: 3');
    });
  });

  describe('legacy helpers', () => {
    it('keeps arrayToList output unchanged', () => {
      expect(PromptComposer.arrayToList(['apple', 'banana'])).toBe(
        '- apple\n- banana'
      );
    });

    it('keeps objectToKeyValue output unchanged', () => {
      expect(
        PromptComposer.objectToKeyValue({
          name: 'Alice',
          age: 30,
        })
      ).toBe('name: Alice\nage: 30');
    });

    it('keeps jsonToXml output unchanged', () => {
      expect(
        PromptComposer.jsonToXml({
          user: {
            name: 'Alice',
            admin: true,
          },
        })
      ).toBe(
        [
          '<root>',
          '  <user>',
          '    <name>Alice</name>',
          '    <admin>true</admin>',
          '  </user>',
          '</root>',
        ].join('\n')
      );
    });
  });

  describe('composer integration', () => {
    it('composes TOON, XML, and plain params deterministically', () => {
      const result = PromptComposer.composer(
        `
        Summary for {{name}}

        Tasks:
        {{tasks}}

        Metadata:
        {{metadata}}

        Footer:
        {{footer}}
        `,
        {
          tasks: {
            data: [
              { id: 1, title: 'Draft prompt' },
              { id: 2, title: 'Review output' },
            ],
            converter: (value) => PromptComposer.format(value),
          },
          metadata: {
            data: {
              owner: 'j',
              tags: ['prompt', 'toon'],
            },
            converter: (value) =>
              PromptComposer.format(value, {
                format: 'xml',
                rootName: 'metadata',
              }),
          },
        },
        {
          name: 'Edge Kit',
          footer: 'done',
        }
      );

      expect(result).toBe(
        [
          'Summary for Edge Kit',
          '',
          'Tasks:',
          '[2]{id,title}:',
          '  1,Draft prompt',
          '  2,Review output',
          '',
          'Metadata:',
          '<metadata>',
          '  <owner>j</owner>',
          '  <tags>prompt</tags>',
          '  <tags>toon</tags>',
          '</metadata>',
          '',
          'Footer:',
          'done',
        ].join('\n')
      );
    });
  });
});
