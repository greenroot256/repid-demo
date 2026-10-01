// RFC-002 — Interaction Protocol (off-chain layer)
//
// Defines the metadata model of an Interaction between two parties
// (partyA, partyB) at the application level, BEFORE an on-chain Receipt
// exists (RFC-003). It operates off-chain (Constitution, Article 1): only
// the resulting Receipt is anchored on-chain.
//
// This module does NOT touch covenants or Indexer logic. It is the
// metadata layer an external application uses to describe an interaction
// and derive the inputs (partyAPkh, partyBPkh) of the
// ReceiptGenesisValidator.

import { utf8ToBin, binToHex } from '@bitauth/libauth';

// Normalizes a pkh received as hex (with or without '0x') or as Uint8Array,
// returning it as hex without '0x'. Returns null if it does not look like a pkh.
function normalizePkh(pkh) {
  if (pkh instanceof Uint8Array) return binToHex(pkh);
  if (typeof pkh !== 'string') return null;
  const clean = pkh.startsWith('0x') ? pkh.slice(2) : pkh;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) return null;
  return clean.toLowerCase();
}

// Validates a role: it must be a non-empty string (domain agnostic).
// RepID carries it in the metadata but never interprets it.
function validateRole(role) {
  return typeof role === 'string' && role.trim().length > 0;
}

// --- TASK-006 / RF-04 ------------------------------------------------
// Rejects the definition of an interaction if any party lacks a pkh or an
// explicit role, or if both parties are the same.
//
// @param input - DefineInteractionInput { partyA, partyB }
// @returns { ok: true, input } | { ok: false, error }
export function validateInteraction(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'An interaction object is required.' };
  }

  if (!input.partyA || !input.partyB) {
    return { ok: false, error: 'An interaction requires exactly two parties (partyA and partyB).' };
  }

  const aPkh = normalizePkh(input.partyA.pkh);
  const bPkh = normalizePkh(input.partyB.pkh);

  if (!aPkh || !bPkh) return { ok: false, error: 'Each party must provide a valid pkh.' };
  if (aPkh === bPkh) return { ok: false, error: 'The two parties of an interaction cannot be the same.' };

  if (!validateRole(input.partyA.role) || !validateRole(input.partyB.role)) {
    return { ok: false, error: 'Each party must provide an explicit (non-empty) role.' };
  }

  return { ok: true, input };
}

// --- TASK-007 / RF-03 ------------------------------------------------
// From an already-validated interaction, generates the metadata ready to
// feed the Receipt genesis (RFC-003): each party's pkh in the order
// expected by ReceiptGenesisValidator, plus the normalized copy of the
// roles for the application layer.
//
// @param input - already-validated DefineInteractionInput
// @returns completed Interaction { protocolRef, partyA, partyB, createdAt }
export function buildInteraction(input) {
  const validated = validateInteraction(input);
  if (!validated.ok) throw new Error(validated.error);

  const original = validated.input;
  return {
    protocolRef: typeof original.protocolRef === 'string' ? original.protocolRef : undefined,
    partyA: {
      pkh: normalizePkh(original.partyA.pkh),
      role: original.partyA.role.trim(),
    },
    partyB: {
      pkh: normalizePkh(original.partyB.pkh),
      role: original.partyB.role.trim(),
    },
    createdAt: new Date().toISOString(),
  };
}

// Returns the inputs in the order expected by the Receipt covenant.
// It is the bridge toward RFC-003: partyAPkh and partyBPkh.
export function toReceiptParts(interaction) {
  return { partyAPkh: interaction.partyA.pkh, partyBPkh: interaction.partyB.pkh };
}

// Utility export for tests that need a synthetic pkh.
export const _internal = { normalizePkh, utf8ToBin };
