// Unit tests for 2.9: the "Send feedback" email (feedbackMail): the support address, the subject, the app details as
// its text, and a mailto link that decodes back to the same message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './load.mjs';

const DETAILS = 'Dovetail 2.9 (data version 5)\nAndroid app, Android 15, WebView/Chrome 140\nHousehold: 2 people, 4 accounts, 12 bills, 3 saved months';

test('feedbackMail: the support address, the subject and the app details under the space for a message', () => {
  const m = P.feedbackMail(DETAILS, '2.9');
  assert.equal(m.to, 'dovetail.feedback@gmail.com');
  assert.equal(P.FEEDBACK_EMAIL, m.to);
  assert.equal(m.subject, 'Dovetail 2.9 feedback');
  assert.equal(m.body, 'What happened, or your idea:\n\n\n\nApp details (no names or amounts):\n' + DETAILS);
});

test('feedbackMail: the mailto link decodes to the same subject and message, with email line breaks', () => {
  const m = P.feedbackMail(DETAILS + '\nA & B = 100%?', '2.9');
  assert.ok(m.mailto.startsWith('mailto:dovetail.feedback@gmail.com?subject='));
  const q = new URLSearchParams(m.mailto.split('?')[1].replace(/\+/g, '%2B'));
  assert.equal(q.get('subject'), 'Dovetail 2.9 feedback');
  assert.equal(q.get('body'), m.body.replace(/\n/g, '\r\n'));
  assert.ok(!/[\s&]/.test(m.mailto.split('?')[1].replace(/&body=/, '')), 'nothing left unencoded');
});

test('feedbackMail: missing details or version still give a usable message', () => {
  const m = P.feedbackMail(undefined, undefined);
  assert.equal(m.subject, 'Dovetail feedback');
  assert.ok(m.body.endsWith('App details (no names or amounts):\n'));
});
