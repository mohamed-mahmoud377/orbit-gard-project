#!/usr/bin/env node
/**
 * Dev-only Figma diff for Account & Security (canvas 32:156).
 * Requires FIGMA_TOKEN in the environment — never commit the token.
 *
 * Usage:
 *   export FIGMA_TOKEN="figd_..."
 *   node scripts/figma-account-diff.mjs
 */

const FILE_KEY = 'xys4uNjGvQZ0KPDjRNuoF5';
const NODE_IDS = ['30:129', '30:2', '30:279', '30:314'];
const REQUEST_DELAY_MS = 3000;

const EXPECTED_COPY = {
  '30:129': [
    'Settings',
    'Your personal details and security.',
    'Personal details',
    'First name',
    'Last name',
    'Username',
    'Cannot be changed',
    'Others use this to send you money, so it is fixed once your account is created',
    'Email',
    'Phone number',
    'EG +20',
    'Egyptian mobile numbers only',
    'Save changes',
    'Cancel',
    'Security',
    'Password',
    'Changing it signs out every device.',
    'Change password',
    'Devices and sessions',
    'Sign out any device remotely.',
    'Manage devices',
  ],
  '30:2': [
    'Devices and sessions',
    'Everywhere you are signed in. Signing out a device ends its session immediately.',
    'THIS DEVICE',
    'Other active sessions',
    'Sign out all others',
    'Sign out',
    'Do not recognise a device? Sign it out and change your password. Changing your password signs out every device automatically.',
  ],
  '30:279': [
    'Change password',
    'Choose something you have not used before.',
    'Current password',
    'Enter your current password',
    'Show',
    'New password',
    'At least 8 characters',
    'At least 8 characters, with a letter and a number',
    'Confirm new password',
    'Repeat the new password',
    'You will be signed out on all',
    'Cancel',
    'Update password',
  ],
  '30:314': [
    'Password changed',
    'Continue to sign in',
  ],
};

const INTENTIONAL_FIGMA_ONLY = [
  'Last changed 12 June 2026. Changing it signs out every device.',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function collectText(node, texts = []) {
  if (!node) {
    return texts;
  }
  if (node.type === 'TEXT' && node.characters?.trim()) {
    texts.push(node.characters.replace(/\n/g, ' ').trim());
  }
  for (const child of node.children ?? []) {
    collectText(child, texts);
  }
  return texts;
}

function layoutChecklist(node, label, lines = []) {
  if (!node) {
    return lines;
  }
  if (node.type === 'FRAME' && ['Card', 'Content', 'Buttons', 'Row / Password'].includes(node.name)) {
    lines.push(
      `${label}/${node.name}: layout=${node.layoutMode ?? 'none'} gap=${node.itemSpacing ?? '-'} pad=${node.paddingLeft ?? '-'}/${node.paddingTop ?? '-'} radius=${node.cornerRadius ?? '-'}`,
    );
  }
  for (const child of node.children ?? []) {
    layoutChecklist(child, label, lines);
  }
  return lines;
}

async function fetchNodes(token, ids) {
  const query = ids.map((id) => encodeURIComponent(id)).join(',');
  const url = `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${query}&depth=10`;
  const response = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });
  if (!response.ok) {
    throw new Error(`Figma API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function diffTexts(nodeId, figmaTexts) {
  const expected = EXPECTED_COPY[nodeId] ?? [];
  const missing = expected.filter(
    (snippet) => !figmaTexts.some((text) => text.includes(snippet.replace(/\.$/, '')) || text.includes(snippet)),
  );
  const figmaOnly = figmaTexts.filter(
    (text) =>
      !expected.some((snippet) => text.includes(snippet) || snippet.includes(text)) &&
      !INTENTIONAL_FIGMA_ONLY.some((snippet) => text.includes(snippet) || snippet.includes(text)) &&
      !text.match(/^(@|MM|Orbit|Dashboard|MONEY|FAMILY|›|in \d+|Next settlement|\d+$)/),
  );
  return { missing, figmaOnly };
}

async function main() {
  const token = process.env.FIGMA_TOKEN?.trim();
  if (!token) {
    console.error('Set FIGMA_TOKEN in the environment. Do not commit the token.');
    process.exit(1);
  }

  console.log('Account & Security Figma diff (32:156 journey)\n');

  for (let index = 0; index < NODE_IDS.length; index += 1) {
    const nodeId = NODE_IDS[index];
    if (index > 0) {
      await sleep(REQUEST_DELAY_MS);
    }
    const payload = await fetchNodes(token, [nodeId]);
    const document = payload.nodes?.[nodeId]?.document;
    if (!document) {
      console.log(`=== ${nodeId}: MISSING ===\n`);
      continue;
    }

    const texts = collectText(document);
    const { missing, figmaOnly } = diffTexts(nodeId, texts);
    const layouts = layoutChecklist(document, nodeId);

    console.log(`=== ${nodeId}: ${document.name} ===`);
    console.log(`Text nodes: ${texts.length}`);
    if (missing.length) {
      console.log('Missing in Figma (check app copy):');
      for (const item of missing) {
        console.log(`  - ${item}`);
      }
    } else {
      console.log('Expected app copy: all key snippets found in Figma.');
    }
    if (figmaOnly.length) {
      console.log('Figma-only snippets (review intentional deviations):');
      for (const item of figmaOnly.slice(0, 12)) {
        console.log(`  - ${item.slice(0, 120)}`);
      }
    }
    if (layouts.length) {
      console.log('Layout checklist:');
      for (const line of layouts.slice(0, 8)) {
        console.log(`  ${line}`);
      }
    }
    console.log('');
  }

  console.log('Intentional app deviations (not bugs):');
  console.log('  - Password "Last changed …" omitted until backend exposes date');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
