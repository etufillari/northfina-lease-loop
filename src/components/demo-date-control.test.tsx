import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messages } from '@/i18n/get-t';
import { DemoDateControl } from './demo-date-control';

const en = messages.en;
const reload = vi.fn();

function stubApi(current: { date: string; is_demo: boolean }, putStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? new Response('{}', { status: putStatus })
        : new Response(JSON.stringify({ success: true, data: current }))
    )
  );
}

const lastPut = () => vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PUT');

async function renderControl() {
  render(<DemoDateControl locale="en" />);
  const input = await screen.findByLabelText(/date/i);
  await waitFor(() => expect(input).not.toBeDisabled());
  return input;
}

beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal('location', { reload });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DemoDateControl', () => {
  it('shows the date the app runs on', async () => {
    stubApi({ date: '2026-11-05', is_demo: false });
    const input = await renderControl();

    expect(input).toHaveValue('2026-11-05');
    expect(screen.getByText(en['admin.demoDate.real'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: en['admin.demoDate.reset'] })).toBeNull();
  });

  it('says when the app is on a demo date, and offers the way back', async () => {
    stubApi({ date: '2027-01-05', is_demo: true });
    await renderControl();

    expect(screen.getByText(en['admin.demoDate.demo'])).toBeTruthy();
    expect(screen.getByRole('button', { name: en['admin.demoDate.reset'] })).toBeTruthy();
  });

  it('cannot set the date it is already on', async () => {
    stubApi({ date: '2026-11-05', is_demo: false });
    await renderControl();

    expect(screen.getByRole('button', { name: en['admin.demoDate.apply'] })).toBeDisabled();
  });

  it('sets a new date and reloads the page', async () => {
    stubApi({ date: '2026-11-05', is_demo: false });
    const input = await renderControl();

    fireEvent.change(input, { target: { value: '2027-01-05' } });
    fireEvent.click(screen.getByRole('button', { name: en['admin.demoDate.apply'] }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(lastPut()?.[1]?.body).toBe(JSON.stringify({ date: '2027-01-05' }));
  });

  it('goes back to the real date', async () => {
    stubApi({ date: '2027-01-05', is_demo: true });
    await renderControl();

    fireEvent.click(screen.getByRole('button', { name: en['admin.demoDate.reset'] }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(lastPut()?.[1]?.body).toBe(JSON.stringify({ date: null }));
  });

  it('says so when the date cannot be changed, and stays on the page', async () => {
    stubApi({ date: '2026-11-05', is_demo: false }, 403);
    const input = await renderControl();

    fireEvent.change(input, { target: { value: '2027-01-05' } });
    fireEvent.click(screen.getByRole('button', { name: en['admin.demoDate.apply'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['admin.demoDate.error']);
    expect(reload).not.toHaveBeenCalled();
  });
});
