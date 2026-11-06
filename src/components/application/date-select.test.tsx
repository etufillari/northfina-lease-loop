import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateSelect } from './date-select';

const labels = { day: 'Day', month: 'Month', year: 'Year' };

function renderSelect(value = '') {
  const onChange = vi.fn();
  render(<DateSelect id="date" value={value} labels={labels} onChange={onChange} className="" />);
  return onChange;
}

const pick = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

const dayOptions = () =>
  within(screen.getByRole('combobox', { name: 'Day' }))
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('DateSelect', () => {
  it('offers numbers for the day and the month', () => {
    renderSelect();

    expect(dayOptions()).toHaveLength(32);
    expect(within(screen.getByRole('combobox', { name: 'Month' })).getByText('12')).toBeTruthy();
  });

  it('sends nothing until all three are chosen', () => {
    const onChange = renderSelect();

    pick('Day', '12');
    pick('Month', '4');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('sends a full date, padded, once all three are chosen', () => {
    const onChange = renderSelect();

    pick('Day', '2');
    pick('Month', '4');
    pick('Year', '1997');

    expect(onChange).toHaveBeenCalledExactlyOnceWith('1997-04-02');
  });

  it('shows a date it is given', () => {
    renderSelect('1997-04-02');

    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveValue('2');
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveValue('4');
    expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('1997');
  });

  it('follows the month and the leap year', () => {
    renderSelect('2024-02-10');
    expect(dayOptions()).toContain('29');

    pick('Year', '2023');
    expect(dayOptions()).not.toContain('29');
  });

  it('clears a day the new month does not have, and withdraws the date', () => {
    const onChange = renderSelect('2023-01-31');

    pick('Month', '2');

    expect(screen.getByRole('combobox', { name: 'Day' })).toHaveValue('');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('');
  });
});
