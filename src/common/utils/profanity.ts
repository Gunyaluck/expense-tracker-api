const DEFAULT_PROFANITY_WORDS = [
  // English
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'pussy',
  'bastard',

  // Thai
  'เหี้ย',
  'เฮี้ย',
  'ควย',
  'ควาย',
  'สัส',
  'สัตว์',
  'ห่า',
  'เย็ด',
  'เยด',
  'กระหรี่',
  'กะหรี่',
  'ดอกทอง',
  'อีดอก',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskProfanity(input: string | null | undefined): string | null {
  if (!input) {
    return input ?? null;
  }

  let output = input;

  for (const word of DEFAULT_PROFANITY_WORDS) {
    const pattern = new RegExp(escapeRegex(word), 'gi');
    output = output.replace(pattern, '***');
  }

  return output;
}
