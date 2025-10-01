import { bench, describe } from 'vitest';
import { fnv1a64B64 } from '../crypto';
import { tpl } from './tpl';

describe('tpl function benchmarks', () => {
  // Simple template benchmark
  bench('simple template', () => {
    tpl`Hello world`;
  });

  // Template with interpolation
  bench('template with interpolation', () => {
    const value = 'world';
    tpl`Hello ${value}`;
  });

  // Complex template with multiple interpolations
  bench('complex template', () => {
    const date = new Date().toISOString();
    const random = Math.random();

    tpl`
      # System prompt
      You are a helpful assistant.
      
      # User query
      ${Math.random().toString(36)}
      
      # Examples
      - Example 1: ${Math.random().toString(36)}
      - Example 2: ${Math.random().toString(36)}
      
      # Additional context
      The current time is: ${date}
      Random value: ${random}
    `;
  });

  // Compare with direct hashing
  bench('full tpl process with hash', () => {
    const value = 'beautiful';
    const result = tpl`Hello ${value} world`;
    tpl.getHash(result);
  });

  bench('direct hash only', () => {
    fnv1a64B64('Hello _TPL$_ world');
  });

  // Large template benchmarks
  const largeTemplate = (() => {
    let template = '';
    for (let i = 0; i < 100; i++) {
      template += `Line #${i}: Some random text\n`;
    }
    return template;
  })();

  bench('direct hash large text (L100 C3000)', () => {
    fnv1a64B64(largeTemplate);
  });

  bench('large raw string (L100 C3000)', () => {
    tpl(largeTemplate);
  });

  bench('large template with interpolation', () => {
    const dynamic = 'dynamic value';
    tpl`${largeTemplate}${dynamic}`;
  });
});
