import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const robots = readFileSync('public/robots.txt', 'utf8');
const llms = readFileSync('public/llms.txt', 'utf8');
const llmsFull = readFileSync('public/llms-full.txt', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');

describe('AI search discovery', () => {
  it('keeps the major answer-engine search crawlers explicitly allowed', () => {
    for (const agent of [
      'OAI-SearchBot',
      'ChatGPT-User',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'Google-Extended',
    ]) {
      assert.match(robots, new RegExp(`User-agent: ${agent}\\nAllow: /`));
    }
  });

  it('keeps private admin routes out of every explicit AI crawler group', () => {
    const aiSection = robots.split('# Allow image bot')[0];
    const groups = aiSection.split(/\n(?=User-agent: )/).filter(group => group.includes('User-agent:'));
    for (const group of groups) {
      assert.match(group, /Disallow: \/admin\n/);
      assert.match(group, /Disallow: \/admin\/\n/);
    }
  });

  it('publishes a canonical factual summary and a detailed limitations page', () => {
    assert.match(indexHtml, /href="https:\/\/calgarywatch\.ca\/llms\.txt"/);
    assert.match(llms, /Canonical website: https:\/\/calgarywatch\.ca\//);
    assert.match(llms, /not a police service, emergency dispatcher, or substitute for 911/i);
    assert.match(llmsFull, /not operated by the Calgary Police Service/i);
    assert.match(llmsFull, /should not state that a specific incident is active/i);
  });

  it('classifies referrals from major AI assistants separately', () => {
    assert.match(appSource, /traffic_source = 'ai_referral'/);
    for (const source of ['chatgpt', 'claude', 'perplexity', 'copilot', 'gemini']) {
      assert.match(appSource, new RegExp(`['"]${source}['"]`));
    }
  });
});
