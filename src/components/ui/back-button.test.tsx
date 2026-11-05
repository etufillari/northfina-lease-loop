import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { BackButton } from './back-button';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const mockBack = vi.fn();
const mockPush = vi.fn();

describe('BackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRouter).mockReturnValue({
      back: mockBack,
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the button with the provided label', () => {
    render(<BackButton fallbackHref="/" label="Back to catalogue" />);

    expect(screen.getByRole('button', { name: /back to catalogue/i })).toBeInTheDocument();
  });

  it('navigates back when browser history exists', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);

    render(<BackButton fallbackHref="/" />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockBack).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('uses fallback URL when no browser history exists', () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);

    render(<BackButton fallbackHref="/en" />);

    fireEvent.click(screen.getByRole('button'));

    expect(mockPush).toHaveBeenCalledWith('/en');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
