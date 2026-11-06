import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startContractScheduler } from './scheduler';

const MINUTE = 60_000;
let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startContractScheduler', () => {
  it('runs the task every minute, and not straight away', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    stop = startContractScheduler(task);

    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('runs one timer even if it is started twice', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    stop = startContractScheduler(first);
    startContractScheduler(second);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('keeps running after a task fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const task = vi.fn().mockRejectedValue(new Error('database is busy'));
    stop = startContractScheduler(task);

    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(task).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it('stops', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    startContractScheduler(task)();

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(task).not.toHaveBeenCalled();
  });
});
