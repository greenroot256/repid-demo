import { describe, it, expect } from 'vitest';
import {
  validateInteraction,
  buildInteraction,
  toReceiptParts,
} from '../interaction/repid-interaction.mjs';

// Synthetic pkhs (40 hex, structurally valid)
const PKH_A = 'a1'.repeat(20);
const PKH_B = 'b2'.repeat(20);

describe('SPEC-002 RF-04 — explicit role validation', () => {
  it('accepts a valid interaction with roles on both parties', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'passenger' },
      partyB: { pkh: PKH_B, role: 'driver' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when partyA has no role', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: '' },
      partyB: { pkh: PKH_B, role: 'driver' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when partyB has no role', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'passenger' },
      partyB: { pkh: PKH_B, role: '   ' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when a party pkh is missing', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'passenger' },
      partyB: { role: 'driver' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when both parties are the same', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'passenger' },
      partyB: { pkh: PKH_A, role: 'driver' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when the object or a party is null', () => {
    expect(validateInteraction(null).ok).toBe(false);
    expect(validateInteraction({ partyA: null, partyB: null }).ok).toBe(false);
  });
});

describe('SPEC-002 RF-03 — metadata generation for the Receipt', () => {
  it('generates an Interaction with normalized roles and pkhs', () => {
    const interaction = buildInteraction({
      protocolRef: 'ride-1234',
      partyA: { pkh: `0x${PKH_A.toUpperCase()}`, role: '  passenger  ' },
      partyB: { pkh: PKH_B, role: 'driver' },
    });

    expect(interaction.partyA.pkh).toBe(PKH_A);
    expect(interaction.partyB.pkh).toBe(PKH_B);
    expect(interaction.partyA.role).toBe('passenger'); // trimmed
    expect(interaction.protocolRef).toBe('ride-1234');
    expect(interaction.createdAt).toBeTruthy();
  });

  it('derives the covenant inputs in the expected order (RFC-003)', () => {
    const interaction = buildInteraction({
      partyA: { pkh: PKH_A, role: 'passenger' },
      partyB: { pkh: PKH_B, role: 'driver' },
    });
    expect(toReceiptParts(interaction)).toEqual({
      partyAPkh: PKH_A,
      partyBPkh: PKH_B,
    });
  });

  it('throws when trying to build with invalid data', () => {
    expect(() =>
      buildInteraction({ partyA: { pkh: PKH_A, role: '' }, partyB: { pkh: PKH_B, role: 'x' } }),
    ).toThrow(/role/);
  });
});