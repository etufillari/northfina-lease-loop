import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import { NotificationToasts } from './notification-toasts';

const sonner = vi.hoisted(() => ({ toast: vi.fn(), Toaster: vi.fn(() => null) }));
vi.mock('sonner', () => sonner);

class FakeEventSource {
  static last: FakeEventSource;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  receive(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

beforeEach(() => {
  sonner.toast.mockClear();
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotificationToasts', () => {
  it('connects to the stream', () => {
    render(<NotificationToasts locale="en" />);
    expect(FakeEventSource.last.url).toBe('/api/notifications/stream');
  });

  it('turns a notification into a short message', () => {
    render(<NotificationToasts locale="en" />);

    FakeEventSource.last.receive({ kind: 'ready_for_you', item: 'Pro 14' });

    expect(sonner.toast).toHaveBeenCalledExactlyOnceWith(
      messages.en['notification.ready_for_you'].replace('{item}', 'Pro 14')
    );
  });

  it('uses the language of the page', () => {
    render(<NotificationToasts locale="fi" />);

    FakeEventSource.last.receive({ kind: 'hold_ended', item: 'Pro 14' });

    expect(sonner.toast).toHaveBeenCalledExactlyOnceWith(
      messages.fi['notification.hold_ended'].replace('{item}', 'Pro 14')
    );
  });

  it('closes the connection when it goes away', () => {
    const { unmount } = render(<NotificationToasts locale="en" />);
    const { close } = FakeEventSource.last;

    unmount();

    expect(close).toHaveBeenCalledOnce();
  });
});
