// The outside anchor script (D81): the pure pieces. The outside call itself is never made in a
// test; docs/features/audit-chain.md has the run against freetsa.org.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  filesOfStatement,
  logStillHas,
  parseAnchorArgs,
  parseStatement,
  postArgs,
  queryArgs,
  stampFiles,
  stampName,
  statementText,
  timeOfReply,
  verifyArgs,
  verifyConclusion,
} from './anchor-audit-tsa.mjs';

const hash = 'c'.repeat(64);

describe('parseAnchorArgs', () => {
  it('stamps by default and verifies a named statement', () => {
    expect(parseAnchorArgs([])).toEqual({ mode: 'stamp' });
    expect(parseAnchorArgs(['--verify', 'audit-tsa/head-3.txt'])).toEqual({
      mode: 'verify',
      statement: 'audit-tsa/head-3.txt',
    });
  });

  it('refuses anything else', () => {
    expect(() => parseAnchorArgs(['--verify'])).toThrow('usage');
    expect(() => parseAnchorArgs(['stamp'])).toThrow('usage');
  });
});

describe('the statement', () => {
  it('names the length, the head hash and the public key, and reads back', () => {
    const text = statementText({ length: 3, hash, publicKey: 'MCowBQ==' });
    expect(text).toBe(
      `Lease Loop audit log head (docs/features/audit-chain.md)\nlength: 3\nhash: ${hash}\npublic key: MCowBQ==\n`
    );
    expect(parseStatement(text)).toEqual({ length: 3, hash });
  });

  it('refuses a file that is not a statement', () => {
    expect(() => parseStatement('hello')).toThrow('not an audit head statement');
    expect(() => parseStatement(`length: 0\nhash: ${hash}`)).toThrow();
  });
});

describe('the files and the commands', () => {
  const files = stampFiles('/x/audit-tsa', 3, '20261106T084002Z');

  it('keeps the statement, the request and the reply side by side, named by length and instant', () => {
    expect(stampName('2026-11-06T08:40:02.123Z')).toBe('20261106T084002Z');
    expect(files).toEqual({
      statement: path.join('/x/audit-tsa', 'head-3-20261106T084002Z.txt'),
      query: path.join('/x/audit-tsa', 'head-3-20261106T084002Z.tsq'),
      reply: path.join('/x/audit-tsa', 'head-3-20261106T084002Z.tsr'),
    });
    expect(stampFiles('/x/audit-tsa', 3, '20261106T090000Z').reply).not.toBe(files.reply);
    expect(filesOfStatement(files.statement)).toEqual(files);
  });

  it('asks for a SHA-256 stamp with the certificate, and posts it with a deadline', () => {
    expect(queryArgs(files)).toEqual([
      'ts',
      '-query',
      '-data',
      files.statement,
      '-sha256',
      '-cert',
      '-out',
      files.query,
    ]);
    const post = postArgs('https://tsa.example/tsr', files);
    expect(post).toContain('--max-time');
    expect(post).toContain(`@${files.query}`);
    expect(post.at(-1)).toBe('https://tsa.example/tsr');
  });

  it('verifies against the CA, with the authority certificate when one is given', () => {
    expect(verifyArgs(files, 'ca.pem', null)).toEqual([
      'ts',
      '-verify',
      '-data',
      files.statement,
      '-in',
      files.reply,
      '-CAfile',
      'ca.pem',
    ]);
    expect(verifyArgs(files, 'ca.pem', 'tsa.crt').slice(-2)).toEqual(['-untrusted', 'tsa.crt']);
  });

  it('reads the time from the reply text', () => {
    expect(timeOfReply('Serial number: 0x1\nTime stamp: Nov  6 07:59:30 2026 GMT\n')).toBe(
      'Nov  6 07:59:30 2026 GMT'
    );
    expect(timeOfReply('nothing')).toBeNull();
  });
});

describe('logStillHas', () => {
  it('is true while the row at that length keeps the stamped hash, longer logs included', () => {
    expect(logStillHas(['a', hash], { length: 2, hash })).toBe(true);
    expect(logStillHas(['a', hash, 'd'], { length: 2, hash })).toBe(true);
  });

  it('is false for a rewritten row or a log cut below the stamp', () => {
    expect(logStillHas(['a', 'b'], { length: 2, hash })).toBe(false);
    expect(logStillHas(['a'], { length: 2, hash })).toBe(false);
  });
});

// Review of #69, finding 5: rows edited without recomputing their hashes leave the stamped
// row's hash as it was, so the head check alone would say all is well.
describe('verifyConclusion', () => {
  const head = { length: 2, hash };
  const intact = { ok: true, length: 3, headHash: hash };

  it('is good only when the log has the head and passes the sealed verifier', () => {
    expect(verifyConclusion(true, intact, head)).toEqual({
      ok: true,
      message: 'the log still has that head at #2, and it is intact',
    });
  });

  it('fails a log that has the head but is broken before it', () => {
    const broken = { ok: false, brokenAt: 1, reason: 'hash_mismatch' };
    expect(verifyConclusion(true, broken, head)).toEqual({
      ok: false,
      message: 'the log still has that head at #2, but it is broken now: hash_mismatch at #1',
    });
  });

  it('fails a log that no longer has the head, first', () => {
    expect(verifyConclusion(false, intact, head).message).toMatch(/no longer has that head at #2/);
  });
});
