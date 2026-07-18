import assert from 'node:assert/strict';
import test from 'node:test';
import { extractUrls, isSpamOrExcluded } from '../src/discoveryScraper.js';

test('extracts unique third-party links and removes punctuation', () => {
  assert.deepEqual(
    extractUrls('Apply: https://jobcode.in/job-one/. Again https://jobcode.in/job-one/'),
    ['https://jobcode.in/job-one/'],
  );
});

test('excludes social and promotional links without substring false positives', () => {
  assert.equal(isSpamOrExcluded('https://youtube.com/watch?v=1'), true);
  assert.equal(isSpamOrExcluded('https://notyoutube.com/job'), false);
  assert.equal(isSpamOrExcluded('not a url'), true);
});
