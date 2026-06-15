import { describe, it, expect } from 'vitest';
import { transition, canTransition } from './state-machine';
import { InvalidTransitionError } from './errors';

describe('state machine — transiciones válidas', () => {
  it('draft --confirm--> confirmed', () => {
    expect(transition('draft', 'confirm')).toBe('confirmed');
  });

  it('confirmed --pay--> paid', () => {
    expect(transition('confirmed', 'pay')).toBe('paid');
  });

  it('confirmed --cancel--> cancelled', () => {
    expect(transition('confirmed', 'cancel')).toBe('cancelled');
  });

  it('paid --refund--> cancelled', () => {
    expect(transition('paid', 'refund')).toBe('cancelled');
  });
});

describe('state machine — transiciones inválidas', () => {
  it('lanza InvalidTransitionError en transición no permitida', () => {
    expect(() => transition('draft', 'pay')).toThrow(InvalidTransitionError);
  });

  it('cancelled es estado terminal', () => {
    expect(() => transition('cancelled', 'confirm')).toThrow(InvalidTransitionError);
  });

  it('el error expone from y event', () => {
    try {
      transition('paid', 'confirm');
      expect.unreachable('debió lanzar');
    } catch (e) {
      const err = e as InvalidTransitionError;
      expect(err.from).toBe('paid');
      expect(err.event).toBe('confirm');
    }
  });
});

describe('canTransition', () => {
  it('true para transición permitida', () => {
    expect(canTransition('draft', 'confirm')).toBe(true);
  });

  it('false para transición no permitida', () => {
    expect(canTransition('draft', 'refund')).toBe(false);
  });
});
