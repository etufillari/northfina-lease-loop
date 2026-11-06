import { describe, expect, it, vi } from 'vitest';
import { publish, subscribe } from './bus';

const message = { to: 'customer:a', kind: 'hold_ended', item: 'Bike' } as const;

describe('the notification bus', () => {
  it('delivers to the right address, without the address', () => {
    const listener = vi.fn();
    const stop = subscribe(['customer:a'], listener);

    publish(message);
    stop();

    expect(listener).toHaveBeenCalledExactlyOnceWith({ kind: 'hold_ended', item: 'Bike' });
  });

  it('does not deliver to anyone else', () => {
    const listener = vi.fn();
    const stop = subscribe(['customer:b'], listener);

    publish(message);
    stop();

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribing', () => {
    const listener = vi.fn();
    subscribe(['customer:a'], listener)();

    publish(message);

    expect(listener).not.toHaveBeenCalled();
  });

  it('reaches every open tab of the same person', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribe(['customer:a'], first);
    const stopSecond = subscribe(['customer:a'], second);

    publish(message);
    stopFirst();
    stopSecond();

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('does nothing with no one listening', () => {
    expect(() => publish(message)).not.toThrow();
  });
});
